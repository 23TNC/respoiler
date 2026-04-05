import { Application, Container, Graphics, Text } from 'pixi.js';
import { loadStaticData } from '../../data/loader';
import { loadCardDefinitions } from '../../data/cards/loader';
import { createSpacetimeClient } from '../../spacetime/client';
import { deriveRuntimeState } from '../../spacetime/deriveRuntimeState';
import { axialKey } from '../hex/coords';
import { toQueuedAction, validateStagedAction } from '../actions/validators';
import type { QueuedAction, StagedTileAction } from '../actions/types';
import type { CardDefinition, CardInstanceState } from '../cards/types';
import { canStageCard, getMatchingRecipes, getRecipeCardCategory, type NormalizedStagedCards } from '../recipes/stagingValidation';
import { HexBoardRenderer } from '../render/HexBoardRenderer';
import type { DropFeedbackState } from '../render/HexBoardRenderer';
import { CharacterBoardUI } from '../ui/CharacterBoardUI';
import { SoulHostedTilesUI } from '../ui/SoulHostedTilesUI';
import type { DragCardPayload } from '../ui/dragTypes';
import { renderCardTag } from '../ui/cardVisual';
import { StagedActionUI } from '../ui/StagedActionUI';
import { uiSoundEffects } from '../ui/soundEffects';
import { isHexTile, type BoardTile, type HexTile, type SoulHostedTile } from '../world/types';

export async function startGameScene(container: HTMLElement): Promise<void> {
  const DRAG_THRESHOLD_PX = 8;
  const CHARACTER_ID = 'spacetime-client';
  const TEST_PLAYER_STORAGE_KEY = 'despoiler.testPlayerId';

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
  const staticCardData = loadCardDefinitions();
  const spacetimeClient = createSpacetimeClient();

  let runtimeState = deriveRuntimeState({
    players: [],
    souls: [],
    cards: [],
    worldTiles: [],
    eventTiles: [],
    attachments: [],
    recipeQueues: [],
    recipeQueueCards: [],
    cardReservations: [],
    activePlayerId: null,
    hasAppliedSubscription: false,
  }, staticCardData.cardsById, staticData.tileTypeById);

  const getOrCreateTestPlayerId = (): string => {
    const existing = window.localStorage.getItem(TEST_PLAYER_STORAGE_KEY)?.trim();
    if (existing) {
      return existing;
    }
    const generated = `test-${crypto.randomUUID()}`;
    window.localStorage.setItem(TEST_PLAYER_STORAGE_KEY, generated);
    return generated;
  };

  let playerSoulId = '';
  let viewedSoulId = '';
  const worldTiles = new Map<string, HexTile>();
  const hostedTilesBySoulId = new Map<string, SoulHostedTile[]>();
  const cardDefinitionByInstanceId = new Map<string, CardDefinition>();
  const cardStateByInstanceId = new Map<string, CardInstanceState>();

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

  const updateRuntimeCollections = (): void => {
    worldTiles.clear();
    runtimeState.worldTilesByAxialKey.forEach((tile, key) => {
      worldTiles.set(key, { ...tile });
    });

    hostedTilesBySoulId.clear();
    Object.entries(runtimeState.hostedTilesBySoulId).forEach(([soulId, tiles]) => {
      hostedTilesBySoulId.set(
        soulId,
        tiles.map((tile) => ({
          id: tile.id,
          tileType: tile.tileType,
          soulId,
          eventLabel: tile.eventLabel,
          activeVerbs: [...tile.activeVerbs],
          selected: false,
          discovered: true,
        })),
      );
    });

    cardDefinitionByInstanceId.clear();
    cardStateByInstanceId.clear();
    runtimeState.cardDefinitionsByInstanceId.forEach((card, instanceId) => {
      cardDefinitionByInstanceId.set(instanceId, card);
      cardStateByInstanceId.set(instanceId, 'in_inventory');
    });

    for (const [soulId, stagedForSoul] of stagedBySoulId.entries()) {
      if (!runtimeState.soulById.has(soulId)) {
        stagedBySoulId.delete(soulId);
        continue;
      }

      for (const [tileInstanceId, staged] of stagedForSoul.entries()) {
        const verbInstance = runtimeState.cardInstancesById.get(staged.verbCardInstanceId);
        if (!verbInstance || verbInstance.soulId !== soulId) {
          removeQueuedActionForTile(staged.tileId, soulId);
          stagedForSoul.delete(tileInstanceId);
          continue;
        }

        const validInputInstanceIds = staged.inputCardInstanceIds.filter((inputInstanceId) => {
          const inputInstance = runtimeState.cardInstancesById.get(inputInstanceId);
          return Boolean(inputInstance && inputInstance.soulId === soulId);
        });
        staged.inputCardInstanceIds = validInputInstanceIds;

        const localState: CardInstanceState = staged.status === 'queued' ? 'queued' : 'staged';
        cardStateByInstanceId.set(staged.verbCardInstanceId, localState);
        for (const inputId of staged.inputCardInstanceIds) {
          cardStateByInstanceId.set(inputId, localState);
        }
      }
    }
  };

  const getViewedInventory = () => runtimeState.inventoryBySoulId[viewedSoulId] ?? runtimeState.inventoryBySoulId[playerSoulId];
  const getViewedSoul = () => runtimeState.soulById.get(viewedSoulId) ?? runtimeState.soulById.get(playerSoulId) ?? runtimeState.souls[0];
  const getViewedHostedTiles = (): SoulHostedTile[] => hostedTilesBySoulId.get(viewedSoulId) ?? [];
  const getTileByInstanceId = (tileInstanceId: string): BoardTile | null => {
    for (const tile of worldTiles.values()) {
      if (tile.id === tileInstanceId) {
        return tile;
      }
    }
    return getViewedHostedTiles().find((tile) => tile.id === tileInstanceId) ?? null;
  };
  const characterBoard = new CharacterBoardUI(
    (instance) => cardDefinitionByInstanceId.get(instance.instanceId) ?? staticCardData.cardsById.get(instance.cardId),
    (instanceId) => cardStateByInstanceId.get(instanceId) ?? 'in_inventory',
    getViewedSoul,
    getViewedInventory,
    () => viewedSoulId !== playerSoulId,
  );
  fixedUiLayer.addChild(characterBoard.root);

  const stagedActionUI = new StagedActionUI(staticCardData.cardsById, (instanceId) => cardDefinitionByInstanceId.get(instanceId));
  fixedUiLayer.addChild(stagedActionUI.root);
  const hostedTilesUI = new SoulHostedTilesUI(
    getViewedHostedTiles,
    staticData.tileTypeByKey,
    (tileId) => getViewedStaged().get(tileId),
    (tileId) => tileId === selectedTileInstanceId,
  );
  fixedUiLayer.addChild(hostedTilesUI.root);

  let selectedTileInstanceId: string | null = null;
  const setSelectedTileInstanceId = (next: string | null): void => {
    if (selectedTileInstanceId === next) {
      return;
    }
    selectedTileInstanceId = next;
    if (!next) {
      return;
    }
    const [selectionKind, runtimeId] = next.split(':');
    if (selectionKind === 'world') {
      console.info('[Selection] world tile selected', { tileId: runtimeId });
    } else if (selectionKind === 'event') {
      console.info('[Selection] event tile selected', { eventTileId: runtimeId });
    }
  };
  let lastCardClick: { instanceId: string; atMs: number } | null = null;
  let inspectedTarget:
    | { type: 'tile'; tileInstanceId: string }
    | { type: 'card'; payload: DragCardPayload }
    | null = null;
  const stagedBySoulId = new Map<string, Map<string, StagedTileAction>>();
  const queuedTechniques: QueuedAction[] = [];
  let lastLoggedInventorySignature = '';

  let draggingPayload: DragCardPayload | null = null;
  let draggingDetachedAction: StagedTileAction | null = null;
  let pointerDown:
    | {
        x: number;
        y: number;
        cardPayload: DragCardPayload | null;
        tileInstanceId: string | null;
      }
    | null = null;
  const dragGhost = new Container();
  dragPreviewLayer.addChild(dragGhost);

  const getCardByInstanceId = (instanceId: string): CardDefinition | undefined => cardDefinitionByInstanceId.get(instanceId);
  const getStagedForSoul = (soulId: string): Map<string, StagedTileAction> => {
    let staged = stagedBySoulId.get(soulId);
    if (!staged) {
      staged = new Map<string, StagedTileAction>();
      stagedBySoulId.set(soulId, staged);
    }
    return staged;
  };
  const getViewedStaged = (): Map<string, StagedTileAction> => getStagedForSoul(viewedSoulId);
  const syncTechniqueAttachment = async (soulId: string, tileInstanceId: string, techniqueCardInstanceId: string): Promise<void> => {
    const [hostKind, rawHostId] = tileInstanceId.split(':');
    if ((hostKind !== 'world' && hostKind !== 'event') || !rawHostId) {
      throw new Error(`Invalid tile target "${tileInstanceId}"`);
    }

    if (hostKind === 'world') {
      await spacetimeClient.attachTechniqueToWorldTile(
        BigInt(soulId),
        BigInt(techniqueCardInstanceId),
        BigInt(rawHostId),
      );
      return;
    }

    await spacetimeClient.attachTechniqueToEventTile(
      BigInt(soulId),
      BigInt(techniqueCardInstanceId),
      BigInt(rawHostId),
    );
  };

  const returnCardsToInventory = (action: Pick<StagedTileAction, 'verbCardInstanceId' | 'inputCardInstanceIds'>): void => {
    cardStateByInstanceId.set(action.verbCardInstanceId, 'in_inventory');
    for (const inputId of action.inputCardInstanceIds) {
      cardStateByInstanceId.set(inputId, 'in_inventory');
    }
  };

  const revalidateStagedInputs = (action: StagedTileAction, tileInstanceId: string): void => {
    const tile = getTileByInstanceId(tileInstanceId);
    const verbCard = getCardByInstanceId(action.verbCardInstanceId);
    if (!tile || !verbCard) {
      returnCardsToInventory(action);
      action.inputCardInstanceIds = [];
      return;
    }

    const keptInputs: string[] = [];
    const invalidInputs: string[] = [];
    let stagedCards: NormalizedStagedCards = {
      tileId: staticData.tileTypeByKey.get(tile.tileType)?.id ?? null,
      actionCardId: verbCard.id,
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

  const removeQueuedActionForTile = (tileId: string, soulId: string): void => {
    const index = queuedTechniques.findIndex(
      (action) => action.tileId === tileId && action.characterId === CHARACTER_ID && action.soulId === soulId,
    );
    if (index >= 0) {
      queuedTechniques.splice(index, 1);
    }
  };

  const removeStagedAction = (tileInstanceId: string, soulId = viewedSoulId): void => {
    const stagedForSoul = getStagedForSoul(soulId);
    const existing = stagedForSoul.get(tileInstanceId);
    if (!existing) {
      return;
    }

    returnCardsToInventory(existing);
    removeQueuedActionForTile(existing.tileId, soulId);
    stagedForSoul.delete(tileInstanceId);
  };

  const render = (): void => {
    for (const tile of worldTiles.values()) {
      tile.selected = tile.id === selectedTileInstanceId;
    }
    for (const tile of getViewedHostedTiles()) {
      tile.selected = tile.id === selectedTileInstanceId;
    }

    const viewedStaged = getViewedStaged();
    const stagedByTileId = new Map<string, {
      verbId: string;
      verbLabel: string;
      tileLabel?: string;
      cardColor?: number;
      stagedCardNames: string[];
      repeat: boolean;
      status: 'staged' | 'queued';
    }>(
      Array.from(viewedStaged.values()).map((staged) => {
        const verbLabel = getCardByInstanceId(staged.verbCardInstanceId)?.name ?? staged.verbCardInstanceId;
        const stagedTile = getTileByInstanceId(staged.tileInstanceId);
        return [
          staged.tileId,
          {
            verbId: String(getCardByInstanceId(staged.verbCardInstanceId)?.id ?? ''),
            verbLabel,
            tileLabel: staticData.tileTypeByKey.get(stagedTile?.tileType ?? '')?.name,
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

    for (const [tileId, details] of runtimeState.runtimeStageDetailsByTileId.entries()) {
      if (stagedByTileId.has(tileId)) {
        continue;
      }
      stagedByTileId.set(tileId, {
        verbId: details.attachmentName ?? '',
        verbLabel: details.attachmentName ?? 'Attached Technique',
        stagedCardNames: details.cardNames,
        repeat: false,
        status: 'staged',
      });
    }

    boardRenderer.renderTiles(worldTiles.values(), { tileTypeByKey: staticData.tileTypeByKey }, stagedByTileId);
    hostedTilesUI.render();

    if (inspectedTarget?.type === 'card') {
      stagedActionUI.setSelectedCard({
        card: inspectedTarget.payload.card,
        instanceId: inspectedTarget.payload.instance.instanceId,
      });
    } else {
      const inspectedTileInstanceId = inspectedTarget?.type === 'tile' ? inspectedTarget.tileInstanceId : selectedTileInstanceId;
      const selectedTile = inspectedTileInstanceId ? getTileByInstanceId(inspectedTileInstanceId) : null;
      stagedActionUI.setSelectedTile(
        selectedTile
          ? {
              tile: selectedTile,
              tileType: staticData.tileTypeByKey.get(selectedTile.tileType),
              availableVerbs: selectedTile.activeVerbs.map((verbId) => staticData.verbById.get(verbId)).filter((verb): verb is NonNullable<typeof verb> => Boolean(verb)),
              stagedAction: viewedStaged.get(inspectedTileInstanceId ?? '') ?? null,
            }
          : null,
      );
    }
    characterBoard.render();
  };

  const setDragRejection = (message: string): void => {
    if (!selectedTileInstanceId) {
      return;
    }
    const staged = getViewedStaged().get(selectedTileInstanceId);
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
    if (!ignoreInventoryState && payload.instance.soulId !== viewedSoulId) {
      return;
    }
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
    const staged = getViewedStaged().get(tileKey);
    if (!staged || staged.status === 'queued') {
      return false;
    }

    const verbCard = getCardByInstanceId(staged.verbCardInstanceId);
    if (!verbCard) {
      return false;
    }

    getViewedStaged().delete(tileKey);
    removeQueuedActionForTile(staged.tileId, viewedSoulId);
    staged.error = undefined;
    staged.status = 'staged';
    draggingDetachedAction = staged;

    beginDrag(
      {
        card: verbCard,
        instance: {
          instanceId: staged.verbCardInstanceId,
          cardId: verbCard.id,
          soulId: viewedSoulId,
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
    targetTileInstanceId: string | null,
  ): { state: DropFeedbackState; reason?: string } => {
    if (!targetTileInstanceId) {
      return { state: 'invalid', reason: 'Invalid drop target.' };
    }
    if (payload.instance.soulId !== viewedSoulId) {
      return { state: 'invalid', reason: 'Cannot stage cards from another soul.' };
    }

    const category = getRecipeCardCategory(payload.card);
    if (category !== 'aspect' && category !== 'item') {
      return { state: 'invalid', reason: 'Only recipe inputs can be staged here.' };
    }

    const staged = getViewedStaged().get(targetTileInstanceId);
    if (!staged) {
      return { state: 'invalid', reason: 'No staged action on target tile.' };
    }

    const tile = getTileByInstanceId(targetTileInstanceId);
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
      tileId: staticData.tileTypeByKey.get(tile.tileType)?.id ?? null,
      actionCardId: getCardByInstanceId(staged.verbCardInstanceId)?.id ?? null,
      aspects: stagedInputs.filter((card) => getRecipeCardCategory(card) === 'aspect').map((card) => card.id),
      sundries: stagedInputs.filter((card) => getRecipeCardCategory(card) === 'item').map((card) => card.id),
    };

    if (!canStageCard(stagedCards, { category, id: payload.card.id }, staticData.recipes)) {
      console.info('[DragDrop] rejected input drop due to recipe mismatch', {
        instanceId: payload.instance.instanceId,
        cardId: payload.card.key,
        group: payload.card.group,
        targetTileInstanceId,
        stagedActionCardId: stagedCards.actionCardId,
      });
      return { state: 'invalid', reason: 'Drop does not match any recipe.' };
    }

    return { state: 'valid' };
  };

  const stageVerbOnTile = (payload: DragCardPayload, x: number, y: number): boolean => {
    const category = getRecipeCardCategory(payload.card);
    if (category !== 'action') {
      return false;
    }

    const selectedTile = selectedTileInstanceId ? getTileByInstanceId(selectedTileInstanceId) : null;
    const detailPanelDropTargetId = (
      selectedTileInstanceId
      && selectedTile
      && stagedActionUI.isPointInPanel(x, y)
    )
      ? selectedTileInstanceId
      : null;

    const hostedTileId = hostedTilesUI.tileAtPoint(x, y);
    const hoveredHostedTile = hostedTileId ? getViewedHostedTiles().find((entry) => entry.id === hostedTileId) ?? null : null;
    const coord = boardRenderer.tileAtPixel(x, y);
    const hoveredWorldTile = worldTiles.get(axialKey(coord)) ?? null;
    const tile: BoardTile | null = detailPanelDropTargetId
      ? getTileByInstanceId(detailPanelDropTargetId)
      : (hoveredHostedTile ?? hoveredWorldTile);

    if (!tile || (payload.instance.soulId !== viewedSoulId)) {
      return false;
    }

    const canDrop = canStageCard(
      {
        tileId: staticData.tileTypeByKey.get(tile.tileType)?.id ?? null,
        actionCardId: null,
        aspects: [],
        sundries: [],
      },
      { category, id: payload.card.id },
      staticData.recipes,
    );
    if (!canDrop) {
      return false;
    }

    removeStagedAction(tile.id, viewedSoulId);

    const staged: StagedTileAction = draggingDetachedAction
      ? {
          ...draggingDetachedAction,
          tileId: tile.id,
          tileInstanceId: tile.id,
          status: 'staged',
          error: undefined,
        }
      : {
          stagedActionId: `staged-${tile.id}-${CHARACTER_ID}-${viewedSoulId}`,
          characterId: CHARACTER_ID,
          soulId: viewedSoulId,
          tileId: tile.id,
          tileInstanceId: tile.id,
          verbCardInstanceId: payload.instance.instanceId,
          inputCardInstanceIds: [],
          repeat: false,
          status: 'staged',
        };

    if (draggingDetachedAction) {
      revalidateStagedInputs(staged, tile.id);
    }

    getViewedStaged().set(staged.tileInstanceId, staged);
    cardStateByInstanceId.set(payload.instance.instanceId, 'staged');
    setSelectedTileInstanceId(staged.tileInstanceId);
    inspectedTarget = { type: 'tile', tileInstanceId: staged.tileInstanceId };
    void syncTechniqueAttachment(staged.soulId, staged.tileInstanceId, staged.verbCardInstanceId).catch((error: unknown) => {
      const activeStaged = getViewedStaged().get(staged.tileInstanceId);
      if (activeStaged) {
        activeStaged.error = error instanceof Error ? error.message : 'Failed to sync attached technique.';
      }
      render();
    });
    return true;
  };

  const tryAddInputCardToStaged = (payload: DragCardPayload, staged: StagedTileAction): boolean => {
    if (payload.instance.soulId !== viewedSoulId) {
      staged.error = 'Cannot stage cards from another soul.';
      return false;
    }

    const feedback = getInputDropFeedback(payload, staged.tileInstanceId);
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
    if (payload.instance.soulId !== viewedSoulId) {
      return false;
    }

    let targetTileInstanceId: string | null = null;
    if (selectedTileInstanceId && stagedActionUI.isPointInInputDrop(x, y)) {
      targetTileInstanceId = selectedTileInstanceId;
    }

    if (!targetTileInstanceId) {
      const coord = boardRenderer.tileAtPixel(x, y);
      const hoveredTile = worldTiles.get(axialKey(coord));
      const hoveredHostedId = hostedTilesUI.tileAtPoint(x, y);
      if (hoveredTile && getViewedStaged().has(hoveredTile.id)) {
        targetTileInstanceId = hoveredTile.id;
      } else if (hoveredHostedId && getViewedStaged().has(hoveredHostedId)) {
        targetTileInstanceId = hoveredHostedId;
      }
    }

    if (!targetTileInstanceId) {
      return false;
    }

    const staged = getViewedStaged().get(targetTileInstanceId);
    if (!staged) {
      return false;
    }

    const feedback = getInputDropFeedback(payload, targetTileInstanceId);
    if (feedback.state !== 'valid') {
      staged.error = feedback.reason;
      setSelectedTileInstanceId(targetTileInstanceId);
      inspectedTarget = { type: 'tile', tileInstanceId: targetTileInstanceId };
      return false;
    }

    setSelectedTileInstanceId(targetTileInstanceId);
    inspectedTarget = { type: 'tile', tileInstanceId: targetTileInstanceId };
    return tryAddInputCardToStaged(payload, staged);
  };

  const updateDragFeedback = (payload: DragCardPayload, x: number, y: number): void => {
    boardRenderer.setDropHoverTile(null);
    stagedActionUI.setInputDropFeedback('none');

    const hoverCoord = boardRenderer.tileAtPixel(x, y);
    const hoverWorldTile = worldTiles.get(axialKey(hoverCoord));
    const hoverHostedTileId = hostedTilesUI.tileAtPoint(x, y);
    const hoverTileInstanceId = hoverHostedTileId ?? hoverWorldTile?.id ?? null;
    const hasStagedAction = hoverTileInstanceId ? getViewedStaged().has(hoverTileInstanceId) : false;

    if (getRecipeCardCategory(payload.card) === 'action') {
      const detailPanelTargetTile = (
        selectedTileInstanceId
        && stagedActionUI.isPointInPanel(x, y)
      )
        ? getTileByInstanceId(selectedTileInstanceId)
        : null;
      const hoverTile = detailPanelTargetTile ?? (hoverTileInstanceId ? getTileByInstanceId(hoverTileInstanceId) : null);
      if (!hoverTile) {
        return;
      }
      const canDrop = canStageCard(
        {
          tileId: staticData.tileTypeByKey.get(hoverTile.tileType)?.id ?? null,
          actionCardId: null,
          aspects: [],
          sundries: [],
        },
        { category: 'action', id: payload.card.id },
        staticData.recipes,
      );
      boardRenderer.setDropHoverTile(
        canDrop && isHexTile(hoverTile)
          ? axialKey({ q: hoverTile.q, r: hoverTile.r })
          : null,
      );
      return;
    }

    if (selectedTileInstanceId && stagedActionUI.isPointInInputDrop(x, y)) {
      const stagedFeedback = getInputDropFeedback(payload, selectedTileInstanceId);
      stagedActionUI.setInputDropFeedback(stagedFeedback.state);
      return;
    }

    if (hasStagedAction) {
      const stagedFeedback = getInputDropFeedback(payload, hoverTileInstanceId);
      if (stagedFeedback.state === 'valid') {
        boardRenderer.setDropHoverTile(hoverWorldTile ? axialKey({ q: hoverWorldTile.q, r: hoverWorldTile.r }) : null);
      }
    }
  };

  const clickStart = (): void => {
    if (!selectedTileInstanceId) {
      return;
    }

    const staged = getViewedStaged().get(selectedTileInstanceId);
    if (!staged || staged.status === 'queued') {
      return;
    }

    const tileExists = getTileByInstanceId(staged.tileInstanceId) !== null;
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

    const tile = getTileByInstanceId(staged.tileInstanceId);
    const verbCard = getCardByInstanceId(staged.verbCardInstanceId);
    if (!tile || !verbCard) {
      staged.error = 'Tile or verb card is unavailable.';
      render();
      return;
    }

    const tileDefinitionId = staticData.tileTypeByKey.get(tile.tileType)?.id ?? null;
    if (tileDefinitionId === null) {
      staged.error = 'Tile definition is unknown.';
      render();
      return;
    }

    const normalized: NormalizedStagedCards = {
      tileId: tileDefinitionId,
      actionCardId: verbCard.id,
      aspects: [],
      sundries: [],
    };
    for (const instanceId of staged.inputCardInstanceIds) {
      const card = getCardByInstanceId(instanceId);
      const category = card ? getRecipeCardCategory(card) : null;
      if (!card || (category !== 'aspect' && category !== 'item')) {
        staged.error = `Input card ${instanceId} is unavailable.`;
        render();
        return;
      }
      if (category === 'aspect') {
        normalized.aspects.push(card.id);
      } else {
        normalized.sundries.push(card.id);
      }
    }

    const matchingRecipes = getMatchingRecipes(normalized, staticData.recipes);
    if (matchingRecipes.length === 0) {
      staged.error = 'No matching recipe for staged cards.';
      render();
      return;
    }
    const selectedRecipe = matchingRecipes[0];
    const [hostKind, rawHostId] = staged.tileInstanceId.split(':');
    if ((hostKind !== 'world' && hostKind !== 'event') || !rawHostId) {
      staged.error = 'Invalid tile target.';
      render();
      return;
    }

    void spacetimeClient.queueRecipeOnHost(
      BigInt(staged.soulId),
      hostKind === 'world' ? 'WorldTile' : 'EventTile',
      BigInt(rawHostId),
      selectedRecipe.id,
      BigInt(staged.verbCardInstanceId),
      staged.inputCardInstanceIds.map((id) => BigInt(id)),
    ).then(() => {
      const queued = toQueuedAction(staged);
      queuedTechniques.push(queued);
      staged.status = 'queued';
      staged.error = undefined;

      cardStateByInstanceId.set(staged.verbCardInstanceId, 'queued');
      for (const input of staged.inputCardInstanceIds) {
        cardStateByInstanceId.set(input, 'queued');
      }

      render();
    }).catch((error: unknown) => {
      staged.error = error instanceof Error ? error.message : 'Failed to queue recipe.';
      render();
    });
  };

  const clickRepeat = (): void => {
    if (!selectedTileInstanceId) {
      return;
    }

    const staged = getViewedStaged().get(selectedTileInstanceId);
    if (!staged || staged.status === 'queued') {
      return;
    }

    staged.repeat = !staged.repeat;
    render();
  };

  const clickClear = (): void => {
    if (!selectedTileInstanceId) {
      return;
    }
    removeStagedAction(selectedTileInstanceId);
    render();
  };

  const clickRemoveInputChip = (globalX: number, globalY: number): boolean => {
    if (!selectedTileInstanceId) {
      return false;
    }

    const staged = getViewedStaged().get(selectedTileInstanceId);
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

    if (characterBoard.isPointInReturnToPlayer(x, y)) {
      viewedSoulId = playerSoulId;
      setSelectedTileInstanceId(null);
      inspectedTarget = null;
      render();
      return;
    }

    const payload = characterBoard.cardAtPoint(x, y);
    const tileCoord = boardRenderer.tileAtPixel(x, y);
    const tileKey = axialKey(tileCoord);
    const worldTile = worldTiles.get(tileKey);
    const hostedTileId = hostedTilesUI.tileAtPoint(x, y);

    pointerDown = {
      x,
      y,
      cardPayload: payload,
      tileInstanceId: worldTile?.id ?? hostedTileId ?? null,
    };
  });

  app.stage.on('globalpointermove', (event) => {
    const { x, y } = event.global;

    const hoverCoord = boardRenderer.tileAtPixel(x, y);
    const hoverTileInstanceId = axialKey(hoverCoord);
    boardRenderer.setPointerHoverTile(worldTiles.has(hoverTileInstanceId) ? hoverTileInstanceId : null);

    if (!draggingPayload && pointerDown) {
      const dx = x - pointerDown.x;
      const dy = y - pointerDown.y;
      const movedEnough = (dx * dx + dy * dy) >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;
      if (movedEnough) {
        if (pointerDown.cardPayload) {
          beginDrag(pointerDown.cardPayload, x, y);
        } else if (pointerDown.tileInstanceId) {
          beginDragAttachedAction(pointerDown.tileInstanceId, x, y);
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
            const now = performance.now();
            inspectedTarget = { type: 'card', payload: pointerDown.cardPayload };
            if (
              pointerDown.cardPayload.card.group === 'souls'
              && pointerDown.cardPayload.instance.linkedSoulId
              && lastCardClick
              && lastCardClick.instanceId === pointerDown.cardPayload.instance.instanceId
              && (now - lastCardClick.atMs) <= 350
            ) {
              viewedSoulId = pointerDown.cardPayload.instance.linkedSoulId;
              setSelectedTileInstanceId(null);
              inspectedTarget = null;
              lastCardClick = null;
              render();
              pointerDown = null;
              return;
            }
            lastCardClick = { instanceId: pointerDown.cardPayload.instance.instanceId, atMs: now };
            render();
          } else if (pointerDown.tileInstanceId && getTileByInstanceId(pointerDown.tileInstanceId)) {
            setSelectedTileInstanceId(pointerDown.tileInstanceId);
            inspectedTarget = { type: 'tile', tileInstanceId: pointerDown.tileInstanceId };
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

  await spacetimeClient.connect({
    uri: 'ws://127.0.0.1:3000',
    databaseName: 'despoiler-dev',
  });
  const testPlayerId = getOrCreateTestPlayerId();
  await spacetimeClient.resolveTestPlayer(testPlayerId);

  spacetimeClient.subscribe((rows) => {
    runtimeState = deriveRuntimeState(rows, staticCardData.cardsById, staticData.tileTypeById);
    playerSoulId = runtimeState.playerSoulId ?? '';
    if (!viewedSoulId || !runtimeState.soulById.has(viewedSoulId)) {
      viewedSoulId = playerSoulId || runtimeState.souls[0]?.soulId || '';
    }

    const viewedInventory = runtimeState.inventoryBySoulId[viewedSoulId];
    const viewedTechniqueCount = viewedInventory?.techniques.length ?? 0;
    const viewedEssenceCount = viewedInventory?.essence.length ?? 0;
    const viewedSundriesCount = viewedInventory?.sundries.length ?? 0;
    const viewedReveriesCount = viewedInventory?.reveries.length ?? 0;
    const viewedSoulsCount = viewedInventory?.souls.length ?? 0;
    const viewedDerivedCardCount = viewedTechniqueCount
      + viewedEssenceCount
      + viewedSundriesCount
      + viewedReveriesCount
      + viewedSoulsCount;
    const localCachedCardInstances = runtimeState.cardInstancesById.size;
    const inventorySignature = [
      rows.cards.length,
      localCachedCardInstances,
      viewedSoulId,
      viewedDerivedCardCount,
      viewedTechniqueCount,
      viewedEssenceCount,
      viewedSundriesCount,
      viewedReveriesCount,
      viewedSoulsCount,
    ].join('|');
    if (inventorySignature !== lastLoggedInventorySignature) {
      console.info('[CharacterBoard] subscription sync', {
        runtimeRowsCards: rows.cards.length,
        localCachedCardInstances,
        viewedSoulId,
        viewedDerivedCardCount,
        viewedTechniques: viewedTechniqueCount,
        viewedEssences: viewedEssenceCount,
        viewedSundries: viewedSundriesCount,
        viewedReveries: viewedReveriesCount,
        viewedSouls: viewedSoulsCount,
      });
      lastLoggedInventorySignature = inventorySignature;
    }

    updateRuntimeCollections();
    layoutUi();
    render();
  });

  function layoutUi(): void {
    app.stage.hitArea = app.screen;
    const boardSize = characterBoard.size();
    const characterBoardX = Math.max(16, (app.screen.width - boardSize.width) * 0.5);
    const characterBoardY = app.screen.height - boardSize.height - 16;
    characterBoard.setPosition(characterBoardX, characterBoardY);
    const hostedPanelSize = hostedTilesUI.size();
    hostedTilesUI.setPosition(16, app.screen.height - hostedPanelSize.height - 16);

    stagedActionUI.setPosition(app.screen.width - 376, app.screen.height - 356);
    const boardViewportHeight = Math.max(220, characterBoardY - 40);
    boardRenderer.centerOn(app.screen.width, boardViewportHeight);
  }

  layoutUi();
  render();

  app.renderer.on('resize', () => {
    layoutUi();
    render();
  });
}
