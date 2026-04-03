import { Application, Container, Graphics, Text } from 'pixi.js';
import { loadStaticData } from '../../data/loader';
import { loadCardDefinitions } from '../../data/cards/loader';
import { loadSelectedCharacter } from '../../data/characters/loader';
import { axialKey } from '../hex/coords';
import { getCompatibilityHint, isCardCompatibleForVerb } from '../actions/compatibility';
import { toQueuedAction, validateStagedAction } from '../actions/validators';
import type { QueuedAction, StagedTileAction } from '../actions/types';
import type { CardDefinition, CardInstanceState } from '../cards/types';
import { HexBoardRenderer } from '../render/HexBoardRenderer';
import { CharacterBoardUI } from '../ui/CharacterBoardUI';
import type { DragCardPayload } from '../ui/dragTypes';
import { StagedActionUI } from '../ui/StagedActionUI';
import { generateMockWorld } from '../world/mockWorld';

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

  const allInstances = Object.values(selectedCharacter.inventory).flat();
  const cardDefinitionByInstanceId = new Map(allInstances.map((instance) => [instance.instanceId, cardData.cardsById.get(instance.cardId)]));
  const cardStateByInstanceId = new Map(allInstances.map((instance) => [instance.instanceId, 'in_inventory' as CardInstanceState]));

  const worldBaseLayer = new Container();
  const worldHexLayer = new Container();
  const worldOverlayLayer = new Container();
  const stagedActionLayer = new Container();
  const fixedUiLayer = new Container();
  const dragPreviewLayer = new Container();

  app.stage.sortableChildren = true;
  worldBaseLayer.zIndex = 0;
  worldHexLayer.zIndex = 10;
  worldOverlayLayer.zIndex = 20;
  stagedActionLayer.zIndex = 30;
  fixedUiLayer.zIndex = 40;
  dragPreviewLayer.zIndex = 50;
  app.stage.addChild(worldBaseLayer, worldHexLayer, worldOverlayLayer, stagedActionLayer, fixedUiLayer, dragPreviewLayer);

  const boardRenderer = new HexBoardRenderer(52);
  boardRenderer.centerOn(app.screen.width, app.screen.height);
  worldHexLayer.addChild(boardRenderer.root);

  const characterBoard = new CharacterBoardUI(selectedCharacter, cardData.cardsById, (instanceId) => cardStateByInstanceId.get(instanceId) ?? 'in_inventory');
  fixedUiLayer.addChild(characterBoard.root);

  const stagedActionUI = new StagedActionUI(cardData.cardsById, (instanceId) => cardDefinitionByInstanceId.get(instanceId));
  fixedUiLayer.addChild(stagedActionUI.root);

  let selectedTileKey: string | null = null;
  const stagedByTileKey = new Map<string, StagedTileAction>();
  const queuedActions: QueuedAction[] = [];

  let draggingPayload: DragCardPayload | null = null;
  const dragGhost = new Container();
  dragPreviewLayer.addChild(dragGhost);

  const getCardByInstanceId = (instanceId: string): CardDefinition | undefined => cardDefinitionByInstanceId.get(instanceId);

  const returnCardsToInventory = (action: Pick<StagedTileAction, 'verbCardInstanceId' | 'inputCardInstanceIds'>): void => {
    cardStateByInstanceId.set(action.verbCardInstanceId, 'in_inventory');
    for (const inputId of action.inputCardInstanceIds) {
      cardStateByInstanceId.set(inputId, 'in_inventory');
    }
  };

  const removeQueuedActionForTile = (tileId: string): void => {
    const index = queuedActions.findIndex((action) => action.tileId === tileId && action.characterId === selectedCharacter.id);
    if (index >= 0) {
      queuedActions.splice(index, 1);
    }
  };

  const removeStagedAction = (tileKey: string): void => {
    const existing = stagedByTileKey.get(tileKey);
    if (!existing) {
      return;
    }

    returnCardsToInventory(existing);
    removeQueuedActionForTile(existing.tileId);
    stagedByTileKey.delete(tileKey);
  };

  const render = (): void => {
    for (const tile of world.tiles.values()) {
      tile.selected = axialKey({ q: tile.q, r: tile.r }) === selectedTileKey;
    }

    const stagedByTileId = new Map(
      Array.from(stagedByTileKey.values()).map((staged) => {
        const verbLabel = getCardByInstanceId(staged.verbCardInstanceId)?.name ?? staged.verbCardInstanceId;
        return [
          staged.tileId,
          {
            verbLabel,
            stagedCardNames: staged.inputCardInstanceIds.map(
              (instanceId) => getCardByInstanceId(instanceId)?.name ?? instanceId,
            ),
            repeat: staged.repeat,
            status: staged.status,
          },
        ] as const;
      }),
    );

    boardRenderer.renderTiles(
      world.tiles.values(),
      staticData,
      (coord) => {
        selectedTileKey = axialKey(coord);
        render();
      },
      stagedByTileId,
    );

    const selectedTile = selectedTileKey ? world.tiles.get(selectedTileKey) ?? null : null;
    stagedActionUI.setSelectedTile(
      selectedTile
        ? {
            tile: selectedTile,
            tileType: staticData.tileTypeById.get(selectedTile.tileType),
            availableVerbs: selectedTile.activeVerbs.map((verbId) => staticData.verbById.get(verbId)).filter((verb): verb is NonNullable<typeof verb> => Boolean(verb)),
            stagedAction: stagedByTileKey.get(selectedTileKey ?? '') ?? null,
          }
        : null,
    );
    characterBoard.render();
  };

  const setDragRejection = (message: string): void => {
    if (!selectedTileKey) {
      return;
    }
    const staged = stagedByTileKey.get(selectedTileKey);
    if (staged) {
      staged.error = message;
    }
  };

  const updateGhost = (x: number, y: number): void => {
    dragGhost.removeChildren();
    if (!draggingPayload) {
      return;
    }

    const bg = new Graphics();
    bg.roundRect(0, 0, 130, 28, 6).fill({ color: 0xffffff, alpha: 0.95 }).stroke({ color: 0x1b2537, width: 1 });
    const label = new Text({ text: draggingPayload.card.name, style: { fill: '#111827', fontSize: 12, fontWeight: '700' } });
    label.position.set(8, 6);

    dragGhost.position.set(x + 10, y + 10);
    dragGhost.addChild(bg, label);
  };

  const beginDrag = (payload: DragCardPayload, x: number, y: number): void => {
    if ((cardStateByInstanceId.get(payload.instance.instanceId) ?? 'in_inventory') !== 'in_inventory') {
      return;
    }

    draggingPayload = payload;
    updateGhost(x, y);
  };

  const clearDrag = (): void => {
    draggingPayload = null;
    boardRenderer.setDropHoverTile(null);
    stagedActionUI.setInputDropHighlight(false);
    dragGhost.removeChildren();
    render();
  };

  const stageVerbOnTile = (payload: DragCardPayload, x: number, y: number): boolean => {
    if (payload.card.group !== 'actions') {
      return false;
    }

    const coord = boardRenderer.tileAtPixel(x, y);
    const tileKey = axialKey(coord);
    const tile = world.tiles.get(tileKey);
    if (!tile) {
      return false;
    }

    removeStagedAction(tileKey);

    const staged: StagedTileAction = {
      stagedActionId: `staged-${tile.id}-${selectedCharacter.id}`,
      characterId: selectedCharacter.id,
      tileId: tile.id,
      tileKey,
      verbCardInstanceId: payload.instance.instanceId,
      inputCardInstanceIds: [],
      repeat: false,
      status: 'staged',
    };

    stagedByTileKey.set(staged.tileKey, staged);
    cardStateByInstanceId.set(payload.instance.instanceId, 'staged');
    selectedTileKey = staged.tileKey;
    return true;
  };

  const tryAddInputCardToStaged = (payload: DragCardPayload, staged: StagedTileAction): boolean => {
    const verbCard = getCardByInstanceId(staged.verbCardInstanceId);
    if (!verbCard || !isCardCompatibleForVerb(verbCard.id, payload.card)) {
      staged.error = `Incompatible input. ${getCompatibilityHint(verbCard?.id ?? '')}`;
      return false;
    }

    if (staged.inputCardInstanceIds.includes(payload.instance.instanceId)) {
      staged.error = 'Cannot stage duplicate card in one action.';
      return false;
    }

    staged.inputCardInstanceIds.push(payload.instance.instanceId);
    cardStateByInstanceId.set(payload.instance.instanceId, 'staged');
    staged.error = undefined;
    staged.status = 'staged';
    return true;
  };

  const stageInputCard = (payload: DragCardPayload, x: number, y: number): boolean => {
    if (payload.card.group === 'actions') {
      return false;
    }

    let targetTileKey: string | null = null;
    if (selectedTileKey && stagedActionUI.isPointInInputDrop(x, y)) {
      targetTileKey = selectedTileKey;
    } else {
      const coord = boardRenderer.tileAtPixel(x, y);
      const hoveredTileKey = axialKey(coord);
      const tile = world.tiles.get(hoveredTileKey);
      if (tile && tile.activeVerbs.length > 0 && stagedByTileKey.has(hoveredTileKey)) {
        targetTileKey = hoveredTileKey;
      }
    }

    if (!targetTileKey) {
      return false;
    }

    const staged = stagedByTileKey.get(targetTileKey);
    if (!staged) {
      return false;
    }

    selectedTileKey = targetTileKey;
    return tryAddInputCardToStaged(payload, staged);
  };

  const clickStart = (): void => {
    if (!selectedTileKey) {
      return;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged || staged.status === 'queued') {
      return;
    }

    const tileExists = Array.from(world.tiles.values()).some((tile) => tile.id === staged.tileId);
    const validation = validateStagedAction({
      staged,
      tileExists,
      getCardDefinitionByInstanceId: getCardByInstanceId,
    });
    if (!validation.ok) {
      staged.error = validation.error;
      render();
      return;
    }

    const queued = toQueuedAction(staged);
    queuedActions.push(queued);
    staged.status = 'queued';
    staged.error = undefined;

    cardStateByInstanceId.set(staged.verbCardInstanceId, 'queued');
    for (const input of staged.inputCardInstanceIds) {
      cardStateByInstanceId.set(input, 'queued');
    }

    render();
  };

  const clickRepeat = (): void => {
    if (!selectedTileKey) {
      return;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged || staged.status === 'queued') {
      return;
    }

    staged.repeat = !staged.repeat;
    render();
  };

  const clickClear = (): void => {
    if (!selectedTileKey) {
      return;
    }
    removeStagedAction(selectedTileKey);
    render();
  };

  const clickRemoveInputChip = (globalX: number, globalY: number): boolean => {
    if (!selectedTileKey) {
      return false;
    }

    const staged = stagedByTileKey.get(selectedTileKey);
    if (!staged || staged.status === 'queued') {
      return false;
    }

    const chipIndex = stagedActionUI.inputChipIndexAt(globalX, globalY);
    if (chipIndex === null) {
      return false;
    }

    const [removed] = staged.inputCardInstanceIds.splice(chipIndex, 1);
    if (removed) {
      cardStateByInstanceId.set(removed, 'in_inventory');
      staged.error = undefined;
      render();
      return true;
    }

    return false;
  };

  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  app.canvas.addEventListener('wheel', (event) => {
    if (characterBoard.handleWheel(event.clientX, event.clientY, event.deltaY)) {
      event.preventDefault();
      render();
    }
  });

  app.stage.on('pointerdown', (event) => {
    const { x, y } = event.global;

    if (clickRemoveInputChip(x, y)) {
      return;
    }

    if (stagedActionUI.isPointInStart(x, y)) {
      clickStart();
      return;
    }

    if (stagedActionUI.isPointInRepeat(x, y)) {
      clickRepeat();
      return;
    }

    if (stagedActionUI.isPointInClear(x, y)) {
      clickClear();
      return;
    }

    const payload = characterBoard.cardAtPoint(x, y);
    if (payload) {
      beginDrag(payload, x, y);
    }
  });

  app.stage.on('globalpointermove', (event) => {
    const { x, y } = event.global;

    const hoverCoord = boardRenderer.tileAtPixel(x, y);
    const hoverTileKey = axialKey(hoverCoord);
    boardRenderer.setPointerHoverTile(world.tiles.has(hoverTileKey) ? hoverTileKey : null);

    if (draggingPayload?.card.group === 'actions') {
      boardRenderer.setDropHoverTile(world.tiles.has(hoverTileKey) ? hoverTileKey : null);
    }

    if (draggingPayload && draggingPayload.card.group !== 'actions') {
      stagedActionUI.setInputDropHighlight(stagedActionUI.isPointInInputDrop(x, y));
    }

    if (!draggingPayload) {
      render();
      return;
    }

    updateGhost(x, y);
    render();
  });

  app.stage.on('pointerup', (event) => {
    if (!draggingPayload) {
      return;
    }

    const { x, y } = event.global;
    const stagedVerb = stageVerbOnTile(draggingPayload, x, y);
    const stagedInput = stageInputCard(draggingPayload, x, y);

    if (!stagedVerb && !stagedInput) {
      setDragRejection('Invalid drop target.');
    }

    clearDrag();
  });

  app.stage.on('pointerupoutside', () => {
    clearDrag();
  });

  const layoutUi = (): void => {
    app.stage.hitArea = app.screen;
    const boardSize = characterBoard.size();
    const characterBoardX = Math.max(16, (app.screen.width - boardSize.width) * 0.5);
    const characterBoardY = app.screen.height - boardSize.height - 16;
    characterBoard.setPosition(characterBoardX, characterBoardY);

    stagedActionUI.setPosition(app.screen.width - 376, app.screen.height - 356);
    const boardViewportHeight = Math.max(220, characterBoardY - 40);
    boardRenderer.centerOn(app.screen.width, boardViewportHeight);
  };

  layoutUi();
  render();

  app.renderer.on('resize', () => {
    layoutUi();
    render();
  });
}
