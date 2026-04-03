import { Application, Container, Graphics, Text } from 'pixi.js';
import { loadStaticData } from '../../data/loader';
import { loadCardDefinitions } from '../../data/cards/loader';
import { loadSelectedCharacter } from '../../data/characters/loader';
import { axialKey } from '../hex/coords';
import { HexBoardRenderer } from '../render/HexBoardRenderer';
import { generateMockWorld } from '../world/mockWorld';
import { isCardCompatibleForVerb } from '../actions/compatibility';
import type { StagedTileAction } from '../actions/types';
import { toQueuedAction, validateStagedAction } from '../actions/validators';
import { CharacterBoardUI } from '../ui/CharacterBoardUI';
import { StagedActionUI } from '../ui/StagedActionUI';
import type { DragCardPayload } from '../ui/dragTypes';

export async function startGameScene(container: HTMLElement): Promise<void> {
  const app = new Application();
  await app.init({
    width: window.innerWidth,
    height: window.innerHeight,
    antialias: true,
    background: '#101b2d',
    resizeTo: window,
  });

  container.appendChild(app.canvas);

  const staticData = loadStaticData();
  const cardData = loadCardDefinitions();
  const selectedCharacter = loadSelectedCharacter();
  const world = generateMockWorld(staticData.tileTypes, staticData.verbs, 2);

  const boardRenderer = new HexBoardRenderer(52);
  boardRenderer.centerOn(app.screen.width, app.screen.height);
  app.stage.addChild(boardRenderer.root);

  const characterBoard = new CharacterBoardUI(selectedCharacter, cardData.cardsById);
  characterBoard.setPosition(16, 16);
  app.stage.addChild(characterBoard.root);

  const stagedActionUI = new StagedActionUI(staticData.verbById, cardData.cardsById);
  stagedActionUI.setPosition(app.screen.width - 336, 16);
  app.stage.addChild(stagedActionUI.root);

  let selectedTileKey: string | null = null;
  const stagedByTileKey = new Map<string, StagedTileAction>();
  const queuedActions: ReturnType<typeof toQueuedAction>[] = [];

  let draggingPayload: DragCardPayload | null = null;
  const dragGhost = new Container();
  app.stage.addChild(dragGhost);

  const render = (): void => {
    for (const tile of world.tiles.values()) {
      tile.selected = axialKey({ q: tile.q, r: tile.r }) === selectedTileKey;
    }

    const stagedByTileId = new Map(
      Array.from(stagedByTileKey.values()).map((staged) => [staged.tileId, { verbId: staged.verbId, status: staged.status }]),
    );

    boardRenderer.renderTiles(
      world.tiles.values(),
      staticData,
      (coord) => {
        selectedTileKey = axialKey(coord);
        stagedActionUI.setStagedAction(stagedByTileKey.get(selectedTileKey) ?? null);
        render();
      },
      stagedByTileId,
    );

    stagedActionUI.setStagedAction(selectedTileKey ? (stagedByTileKey.get(selectedTileKey) ?? null) : null);
  };

  const updateGhost = (x: number, y: number): void => {
    dragGhost.removeChildren();
    if (!draggingPayload) {
      return;
    }

    const bg = new Graphics();
    bg.roundRect(0, 0, 110, 24, 6).fill({ color: 0xffffff, alpha: 0.9 }).stroke({ color: 0x1b2537, width: 1 });
    const label = new Text({ text: draggingPayload.card.name, style: { fill: '#111827', fontSize: 12, fontWeight: '700' } });
    label.position.set(8, 4);

    dragGhost.position.set(x + 10, y + 10);
    dragGhost.addChild(bg, label);
  };

  const beginDrag = (payload: DragCardPayload, x: number, y: number): void => {
    draggingPayload = payload;
    updateGhost(x, y);
  };

  const clearDrag = (): void => {
    draggingPayload = null;
    dragGhost.removeChildren();
  };

  const stageVerbOnTile = (payload: DragCardPayload, x: number, y: number): void => {
    if (payload.card.group !== 'actions') {
      return;
    }

    const coord = boardRenderer.tileAtPixel(x, y);
    const tile = world.tiles.get(axialKey(coord));
    if (!tile) {
      return;
    }

    const staged: StagedTileAction = {
      stagedId: `staged-${tile.id}`,
      characterId: selectedCharacter.id,
      tileId: tile.id,
      tileKey: axialKey(coord),
      verbId: payload.card.id,
      inputCardIds: [],
      repeat: false,
      status: 'staged',
    };

    stagedByTileKey.set(staged.tileKey, staged);
    selectedTileKey = staged.tileKey;
    render();
  };

  const stageInputCard = (payload: DragCardPayload, x: number, y: number): void => {
    if (payload.card.group === 'actions') {
      return;
    }

    if (!selectedTileKey) {
      return;
    }

    if (!stagedActionUI.isPointInInputDrop(x, y)) {
      return;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged) {
      return;
    }

    if (!isCardCompatibleForVerb(staged.verbId, payload.card)) {
      staged.error = `Incompatible input: ${payload.card.name}`;
      render();
      return;
    }

    if (staged.inputCardIds.includes(payload.card.id)) {
      staged.error = 'Cannot stage duplicate card in one action.';
      render();
      return;
    }

    staged.inputCardIds.push(payload.card.id);
    staged.error = undefined;
    staged.status = 'staged';
    render();
  };

  const clickStart = (): void => {
    if (!selectedTileKey) {
      return;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged) {
      return;
    }

    const tileExists = Array.from(world.tiles.values()).some((tile) => tile.id === staged.tileId);
    const validation = validateStagedAction({ staged, tileExists, verbsById: staticData.verbById });
    if (!validation.ok) {
      staged.error = validation.error;
      // eslint-disable-next-line no-console
      console.warn('[action-validation-failed]', validation.error, staged);
      render();
      return;
    }

    const queued = toQueuedAction(staged);
    queuedActions.push(queued);
    staged.status = 'queued';
    staged.error = undefined;

    // eslint-disable-next-line no-console
    console.log('[local-queued-action]', queued);
    render();
  };

  const clickRepeat = (): void => {
    if (!selectedTileKey) {
      return;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged) {
      return;
    }

    staged.repeat = !staged.repeat;
    render();
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  app.stage.on('pointerdown', (event) => {
    const { x, y } = event.global;

    if (stagedActionUI.isPointInStart(x, y)) {
      clickStart();
      return;
    }

    if (stagedActionUI.isPointInRepeat(x, y)) {
      clickRepeat();
      return;
    }

    const payload = characterBoard.cardAtPoint(x, y);
    if (payload) {
      beginDrag(payload, x, y);
    }
  });

  app.stage.on('globalpointermove', (event) => {
    if (!draggingPayload) {
      return;
    }
    const { x, y } = event.global;
    updateGhost(x, y);
  });

  app.stage.on('pointerup', (event) => {
    if (!draggingPayload) {
      return;
    }

    const { x, y } = event.global;
    stageVerbOnTile(draggingPayload, x, y);
    stageInputCard(draggingPayload, x, y);
    clearDrag();
  });

  app.stage.on('pointerupoutside', () => {
    clearDrag();
  });

  render();

  window.addEventListener('resize', () => {
    boardRenderer.centerOn(app.screen.width, app.screen.height);
    stagedActionUI.setPosition(app.screen.width - 336, 16);
    characterBoard.render();
    render();
  });

}
