import { Application, Container, Graphics, Text } from 'pixi.js';
import { loadStaticData } from '../../data/loader';
import { loadCardDefinitions } from '../../data/cards/loader';
import { loadSelectedCharacter } from '../../data/characters/loader';
import { axialKey } from '../hex/coords';
import { toQueuedAction, validateStagedAction } from '../actions/validators';
import type { QueuedAction, StagedTileAction } from '../actions/types';
import type { CardDefinition, CardInstanceState } from '../cards/types';
import { canStageCard, getRecipeCardCategory, type NormalizedStagedCards } from '../recipes/stagingValidation';
import { HexBoardRenderer } from '../render/HexBoardRenderer';
import type { DropFeedbackState } from '../render/HexBoardRenderer';
import { CharacterBoardUI } from '../ui/CharacterBoardUI';
import type { DragCardPayload } from '../ui/dragTypes';
import { renderCardTag } from '../ui/cardVisual';
import { StagedActionUI } from '../ui/StagedActionUI';
import { uiSoundEffects } from '../ui/soundEffects';
import { generateMockWorld } from '../world/mockWorld';

export async function startGameScene(container: HTMLElement): Promise<void> {
  const DRAG_THRESHOLD_PX = 8;

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
  let inspectedTarget:
    | { type: 'tile'; tileKey: string }
    | { type: 'card'; payload: DragCardPayload }
    | null = null;
  const stagedByTileKey = new Map<string, StagedTileAction>();
  const queuedTechniques: QueuedAction[] = [];

  let draggingPayload: DragCardPayload | null = null;
  let draggingDetachedAction: StagedTileAction | null = null;
  let pointerDown:
    | {
        x: number;
        y: number;
        cardPayload: DragCardPayload | null;
        tileKey: string | null;
      }
    | null = null;
  const dragGhost = new Container();
  dragPreviewLayer.addChild(dragGhost);

  const getCardByInstanceId = (instanceId: string): CardDefinition | undefined => cardDefinitionByInstanceId.get(instanceId);

  const returnCardsToInventory = (action: Pick<StagedTileAction, 'verbCardInstanceId' | 'inputCardInstanceIds'>): void => {
    cardStateByInstanceId.set(action.verbCardInstanceId, 'in_inventory');
    for (const inputId of action.inputCardInstanceIds) {
      cardStateByInstanceId.set(inputId, 'in_inventory');
    }
  };

  const revalidateStagedInputs = (action: StagedTileAction, tileKey: string): void => {
    const tile = world.tiles.get(tileKey);
    const verbCard = getCardByInstanceId(action.verbCardInstanceId);
    if (!tile || !verbCard) {
      returnCardsToInventory(action);
      action.inputCardInstanceIds = [];
      return;
    }

    const keptInputs: string[] = [];
    const invalidInputs: string[] = [];
    let stagedCards: NormalizedStagedCards = {
      tile: tile.tileType,
      action: verbCard.id,
      aspects: [],
      sundries: [],
    };

    for (const instanceId of action.inputCardInstanceIds) {
      const card = getCardByInstanceId(instanceId);
      const category = card ? getRecipeCardCategory(card) : null;
      if (!card || (category !== 'aspect' && category !== 'item')) {
        invalidInputs.push(instanceId);
        continue;
      }

      const isValid = canStageCard(stagedCards, { category, id: card.id }, staticData.recipes);
      if (!isValid) {
        invalidInputs.push(instanceId);
        continue;
      }

      keptInputs.push(instanceId);
      if (category === 'aspect') {
        stagedCards = { ...stagedCards, aspects: [...stagedCards.aspects, card.id] };
      } else {
        stagedCards = { ...stagedCards, sundries: [...stagedCards.sundries, card.id] };
      }
    }

    action.inputCardInstanceIds = keptInputs;
    for (const invalidId of invalidInputs) {
      cardStateByInstanceId.set(invalidId, 'in_inventory');
    }
  };

  const removeQueuedActionForTile = (tileId: string): void => {
    const index = queuedTechniques.findIndex((action) => action.tileId === tileId && action.characterId === selectedCharacter.id);
    if (index >= 0) {
      queuedTechniques.splice(index, 1);
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
            verbId: getCardByInstanceId(staged.verbCardInstanceId)?.id ?? '',
            verbLabel,
            tileLabel: staticData.tileTypeById.get(world.tiles.get(staged.tileKey)?.tileType ?? '')?.name,
            cardColor: getCardByInstanceId(staged.verbCardInstanceId)?.backgroundColor,
            stagedCardNames: staged.inputCardInstanceIds.map(
              (instanceId) => getCardByInstanceId(instanceId)?.name ?? instanceId,
            ),
            repeat: staged.repeat,
            status: staged.status,
          },
        ] as const;
      }),
    );

    boardRenderer.renderTiles(world.tiles.values(), staticData, stagedByTileId);

    if (inspectedTarget?.type === 'card') {
      stagedActionUI.setSelectedCard({
        card: inspectedTarget.payload.card,
        instanceId: inspectedTarget.payload.instance.instanceId,
      });
    } else {
      const inspectedTileKey = inspectedTarget?.type === 'tile' ? inspectedTarget.tileKey : selectedTileKey;
      const selectedTile = inspectedTileKey ? world.tiles.get(inspectedTileKey) ?? null : null;
      stagedActionUI.setSelectedTile(
        selectedTile
          ? {
              tile: selectedTile,
              tileType: staticData.tileTypeById.get(selectedTile.tileType),
              availableVerbs: selectedTile.activeVerbs.map((verbId) => staticData.verbById.get(verbId)).filter((verb): verb is NonNullable<typeof verb> => Boolean(verb)),
              stagedAction: stagedByTileKey.get(inspectedTileKey ?? '') ?? null,
            }
          : null,
      );
    }
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


  const shouldPlayCardPickupSound = (payload: DragCardPayload): boolean => (
    payload.card.group === 'techniques'
      || payload.card.group === 'essence'
      || payload.card.group === 'sundries'
      || payload.card.group === 'reveries'
      || payload.card.group === 'souls'
  );

  const updateGhost = (x: number, y: number): void => {
    dragGhost.removeChildren();
    if (!draggingPayload) {
      return;
    }

    dragGhost.position.set(x + 10, y + 10);
    renderCardTag(dragGhost, { x: 0, y: 0, card: draggingPayload.card, width: 90, height: 24 });
  };

  const beginDrag = (payload: DragCardPayload, x: number, y: number, ignoreInventoryState = false): void => {
    if (!ignoreInventoryState && (cardStateByInstanceId.get(payload.instance.instanceId) ?? 'in_inventory') !== 'in_inventory') {
      return;
    }

    draggingPayload = payload;
    updateGhost(x, y);
    if (shouldPlayCardPickupSound(payload)) {
      uiSoundEffects.play('cardUp');
    }
  };

  const beginDragAttachedAction = (tileKey: string, x: number, y: number): boolean => {
    const staged = stagedByTileKey.get(tileKey);
    if (!staged || staged.status === 'queued') {
      return false;
    }

    const verbCard = getCardByInstanceId(staged.verbCardInstanceId);
    if (!verbCard) {
      return false;
    }

    stagedByTileKey.delete(tileKey);
    removeQueuedActionForTile(staged.tileId);
    staged.error = undefined;
    staged.status = 'staged';
    draggingDetachedAction = staged;

    beginDrag(
      {
        card: verbCard,
        instance: {
          instanceId: staged.verbCardInstanceId,
          cardId: verbCard.id,
        },
      },
      x,
      y,
      true,
    );
    return true;
  };

  const clearDrag = (): void => {
    draggingPayload = null;
    draggingDetachedAction = null;
    boardRenderer.setDropHoverTile(null);
    stagedActionUI.setInputDropFeedback('none');
    dragGhost.removeChildren();
    render();
  };

  const getInputDropFeedback = (
    payload: DragCardPayload,
    targetTileKey: string | null,
  ): { state: DropFeedbackState; reason?: string } => {
    if (!targetTileKey) {
      return { state: 'invalid', reason: 'Invalid drop target.' };
    }

    const category = getRecipeCardCategory(payload.card);
    if (category !== 'aspect' && category !== 'item') {
      return { state: 'invalid', reason: 'Only recipe inputs can be staged here.' };
    }

    const staged = stagedByTileKey.get(targetTileKey);
    if (!staged) {
      return { state: 'invalid', reason: 'No staged action on target tile.' };
    }

    const tile = world.tiles.get(targetTileKey);
    if (!tile) {
      return { state: 'invalid', reason: 'Target tile no longer exists.' };
    }

    if (staged.inputCardInstanceIds.includes(payload.instance.instanceId)) {
      return { state: 'invalid', reason: 'Cannot stage duplicate card in one action.' };
    }

    const stagedInputs = staged.inputCardInstanceIds
      .map((instanceId) => getCardByInstanceId(instanceId))
      .filter((card): card is CardDefinition => Boolean(card));
    const stagedCards: NormalizedStagedCards = {
      tile: tile.tileType,
      action: getCardByInstanceId(staged.verbCardInstanceId)?.id ?? null,
      aspects: stagedInputs.filter((card) => getRecipeCardCategory(card) === 'aspect').map((card) => card.id),
      sundries: stagedInputs.filter((card) => getRecipeCardCategory(card) === 'item').map((card) => card.id),
    };

    if (!canStageCard(stagedCards, { category, id: payload.card.id }, staticData.recipes)) {
      return { state: 'invalid', reason: 'Drop does not match any recipe.' };
    }

    return { state: 'valid' };
  };

  const stageVerbOnTile = (payload: DragCardPayload, x: number, y: number): boolean => {
    const category = getRecipeCardCategory(payload.card);
    if (category !== 'action') {
      return false;
    }

    const coord = boardRenderer.tileAtPixel(x, y);
    const tileKey = axialKey(coord);
    const tile = world.tiles.get(tileKey);
    if (!tile) {
      return false;
    }

    const canDrop = canStageCard(
      {
        tile: tile.tileType,
        action: null,
        aspects: [],
        sundries: [],
      },
      { category, id: payload.card.id },
      staticData.recipes,
    );
    if (!canDrop) {
      return false;
    }

    removeStagedAction(tileKey);

    const staged: StagedTileAction = draggingDetachedAction
      ? {
          ...draggingDetachedAction,
          tileId: tile.id,
          tileKey,
          status: 'staged',
          error: undefined,
        }
      : {
          stagedActionId: `staged-${tile.id}-${selectedCharacter.id}`,
          characterId: selectedCharacter.id,
          tileId: tile.id,
          tileKey,
          verbCardInstanceId: payload.instance.instanceId,
          inputCardInstanceIds: [],
          repeat: false,
          status: 'staged',
        };

    if (draggingDetachedAction) {
      revalidateStagedInputs(staged, tileKey);
    }

    stagedByTileKey.set(staged.tileKey, staged);
    cardStateByInstanceId.set(payload.instance.instanceId, 'staged');
    selectedTileKey = staged.tileKey;
    inspectedTarget = { type: 'tile', tileKey: staged.tileKey };
    return true;
  };

  const tryAddInputCardToStaged = (payload: DragCardPayload, staged: StagedTileAction): boolean => {
    const feedback = getInputDropFeedback(payload, staged.tileKey);
    if (feedback.state !== 'valid') {
      staged.error = feedback.reason;
      return false;
    }

    staged.inputCardInstanceIds.push(payload.instance.instanceId);
    cardStateByInstanceId.set(payload.instance.instanceId, 'staged');
    staged.error = undefined;
    staged.status = 'staged';
    return true;
  };

  const stageInputCard = (payload: DragCardPayload, x: number, y: number): boolean => {
    if (payload.card.group === 'techniques') {
      return false;
    }

    let targetTileKey: string | null = null;
    if (selectedTileKey && stagedActionUI.isPointInInputDrop(x, y)) {
      targetTileKey = selectedTileKey;
    }

    if (!targetTileKey) {
      const coord = boardRenderer.tileAtPixel(x, y);
      const hoveredTileKey = axialKey(coord);
      const tile = world.tiles.get(hoveredTileKey);
      if (tile && stagedByTileKey.has(hoveredTileKey)) {
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

    const feedback = getInputDropFeedback(payload, targetTileKey);
    if (feedback.state !== 'valid') {
      staged.error = feedback.reason;
      selectedTileKey = targetTileKey;
      inspectedTarget = { type: 'tile', tileKey: targetTileKey };
      return false;
    }

    selectedTileKey = targetTileKey;
    inspectedTarget = { type: 'tile', tileKey: targetTileKey };
    return tryAddInputCardToStaged(payload, staged);
  };

  const updateDragFeedback = (payload: DragCardPayload, x: number, y: number): void => {
    boardRenderer.setDropHoverTile(null);
    stagedActionUI.setInputDropFeedback('none');

    const hoverCoord = boardRenderer.tileAtPixel(x, y);
    const hoverTileKey = axialKey(hoverCoord);
    const hasStagedAction = stagedByTileKey.has(hoverTileKey);

    if (getRecipeCardCategory(payload.card) === 'action') {
      const hoverTile = world.tiles.get(hoverTileKey);
      if (!hoverTile) {
        return;
      }
      const canDrop = canStageCard(
        {
          tile: hoverTile.tileType,
          action: null,
          aspects: [],
          sundries: [],
        },
        { category: 'action', id: payload.card.id },
        staticData.recipes,
      );
      boardRenderer.setDropHoverTile(canDrop ? hoverTileKey : null);
      return;
    }

    if (selectedTileKey && stagedActionUI.isPointInInputDrop(x, y)) {
      const stagedFeedback = getInputDropFeedback(payload, selectedTileKey);
      stagedActionUI.setInputDropFeedback(stagedFeedback.state);
      return;
    }

    if (hasStagedAction) {
      const stagedFeedback = getInputDropFeedback(payload, hoverTileKey);
      if (stagedFeedback.state === 'valid') {
        boardRenderer.setDropHoverTile(hoverTileKey);
      }
    }
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
    queuedTechniques.push(queued);
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
    pointerDown = null;

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
    const tileCoord = boardRenderer.tileAtPixel(x, y);
    const tileKey = axialKey(tileCoord);
    const hasTile = world.tiles.has(tileKey);

    pointerDown = {
      x,
      y,
      cardPayload: payload,
      tileKey: hasTile ? tileKey : null,
    };
  });

  app.stage.on('globalpointermove', (event) => {
    const { x, y } = event.global;

    const hoverCoord = boardRenderer.tileAtPixel(x, y);
    const hoverTileKey = axialKey(hoverCoord);
    boardRenderer.setPointerHoverTile(world.tiles.has(hoverTileKey) ? hoverTileKey : null);

    if (!draggingPayload && pointerDown) {
      const dx = x - pointerDown.x;
      const dy = y - pointerDown.y;
      const movedEnough = (dx * dx + dy * dy) >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
      if (movedEnough) {
        if (pointerDown.cardPayload) {
          beginDrag(pointerDown.cardPayload, x, y);
        } else if (pointerDown.tileKey) {
          beginDragAttachedAction(pointerDown.tileKey, x, y);
        }
      }
    }

    if (!draggingPayload) {
      render();
      return;
    }

    updateDragFeedback(draggingPayload, x, y);
    updateGhost(x, y);
    render();
  });

  app.stage.on('pointerup', (event) => {
    const { x, y } = event.global;

    if (!draggingPayload) {
      if (pointerDown) {
        const dx = x - pointerDown.x;
        const dy = y - pointerDown.y;
        const movedEnough = (dx * dx + dy * dy) >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;

        if (!movedEnough) {
          if (pointerDown.cardPayload) {
            inspectedTarget = { type: 'card', payload: pointerDown.cardPayload };
            render();
          } else if (pointerDown.tileKey && world.tiles.has(pointerDown.tileKey)) {
            selectedTileKey = pointerDown.tileKey;
            inspectedTarget = { type: 'tile', tileKey: pointerDown.tileKey };
            render();
          }
        }
      }
      pointerDown = null;
      return;
    }

    const stagedVerb = stageVerbOnTile(draggingPayload, x, y);
    const stagedInput = stageInputCard(draggingPayload, x, y);

    if (!stagedVerb && !stagedInput && draggingDetachedAction) {
      returnCardsToInventory(draggingDetachedAction);
    }

    if (!stagedVerb && !stagedInput && !draggingDetachedAction) {
      setDragRejection('Invalid drop target.');
    }

    if (stagedVerb || stagedInput) {
      uiSoundEffects.play('cardDown');
    }

    clearDrag();
    pointerDown = null;
  });

  app.stage.on('pointerupoutside', () => {
    if (draggingDetachedAction) {
      returnCardsToInventory(draggingDetachedAction);
    }
    pointerDown = null;
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
