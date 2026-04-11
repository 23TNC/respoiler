import type {
  ActionTracker,
  Card,
  CardTracker,
  EventTracker,
  Player,
  SlotTracker,
  Tile,
  TileTracker,
} from "../spacetime/bindings/types";

export type CardCategory = "action" | "skill" | "item" | "memory" | "soul";
export type EntityId = bigint | number;

export type DefinitionInfo = {
  name: string;
  topColor: number;
  bottomColor: number;
};

export type DefinitionLookup = (definitionId: EntityId) => DefinitionInfo | undefined;

export type TrackedCard = {
  card: Card;
  tracker?: CardTracker;
  actionState: "staged" | "queued" | "running" | "complete";
  definition?: DefinitionInfo;
};

export type TrackedTile = {
  tile: Tile;
  tracker?: TileTracker;
  attachedCards: TrackedCard[];
};

export type ViewModelSelection = {
  type: "tile" | "card";
  id: EntityId;
};

export type GameViewSnapshot = {
  players: Player[];
  cards: Card[];
  cardTrackers: CardTracker[];
  actionTrackers: ActionTracker[];
  tiles: Tile[];
  tileTrackers: TileTracker[];
  eventTrackers: EventTracker[];
  slotTrackers: SlotTracker[];
};

export type DerivedGameViewModel = {
  observerCardId: EntityId;
  viewedCardId: EntityId;
  viewedSelfCard?: TrackedCard;
  viewedCardTracker?: CardTracker;
  viewedTileTracker?: TileTracker;
  worldTiles: TrackedTile[];
  eventTiles: Array<TrackedTile & { createTime: number }>;
  slotTiles: Array<TrackedTile & { q: number; r: number }>;
  inventories: Record<CardCategory, TrackedCard[]>;
};

const ZERO_ID = 0n;

export const idToKey = (id: EntityId): string => `${id.toString()}`;

export const deriveActionState = (
  actionTracker: ActionTracker | undefined,
): TrackedCard["actionState"] => {
  if (!actionTracker) {
    return "staged";
  }
  if (actionTracker.completedAt > 0) {
    return "complete";
  }
  if (actionTracker.startedAt > 0) {
    return "running";
  }
  if (actionTracker.queuedAt > 0) {
    return "queued";
  }
  return "staged";
};


const toInventoryCategory = (cardType: number): CardCategory | undefined => {
  switch (cardType) {
    case 1:
      return "action";
    case 2:
      return "skill";
    case 3:
      return "item";
    case 4:
      return "memory";
    case 5:
      return "soul";
    default:
      return undefined;
  }
};

export const deriveGameViewModel = (
  snapshot: GameViewSnapshot,
  observerCardId: EntityId,
  viewedCardId: EntityId,
  lookupDefinition?: DefinitionLookup,
): DerivedGameViewModel => {
  const tileById = new Map(snapshot.tiles.map((tile) => [idToKey(tile.tileId), tile]));
  const trackerByTileId = new Map(snapshot.tileTrackers.map((tracker) => [idToKey(tracker.tileId), tracker]));
  const cardTrackerByCardId = new Map(snapshot.cardTrackers.map((tracker) => [idToKey(tracker.cardId), tracker]));
  const actionByCardId = new Map(snapshot.actionTrackers.map((action) => [idToKey(action.cardId), action]));

  const ownedCards = snapshot.cards.filter((card) => card.ownerCardId === viewedCardId);
  const attachedCardsByTileId = new Map<string, TrackedCard[]>();

  const trackedOwnedCards: TrackedCard[] = ownedCards.map((card) => {
    const tracker = cardTrackerByCardId.get(idToKey(card.cardId));
    const trackedCard: TrackedCard = {
      card,
      tracker,
      actionState: deriveActionState(actionByCardId.get(idToKey(card.cardId))),
      definition: lookupDefinition?.(card.definitionId),
    };

    if (tracker && tracker.linkedTileId !== ZERO_ID) {
      const tileKey = idToKey(tracker.linkedTileId);
      const existing = attachedCardsByTileId.get(tileKey);
      if (existing) {
        existing.push(trackedCard);
      } else {
        attachedCardsByTileId.set(tileKey, [trackedCard]);
      }
    }

    return trackedCard;
  });

  const inventories: Record<CardCategory, TrackedCard[]> = {
    action: [],
    skill: [],
    item: [],
    memory: [],
    soul: [],
  };

  let viewedSelfCard: TrackedCard | undefined;
  for (const trackedCard of trackedOwnedCards) {
    if (trackedCard.card.cardId === viewedCardId) {
      viewedSelfCard = trackedCard;
    }

    const category = toInventoryCategory(trackedCard.card.cardType);
    if (!category) {
      console.warn("[ui-debug] unknown card_type encountered", {
        cardId: trackedCard.card.cardId,
        cardType: trackedCard.card.cardType,
      });
      continue;
    }

    inventories[category].push(trackedCard);
  }

  if (!viewedSelfCard) {
    const selfCard = snapshot.cards.find((card) => card.cardId === viewedCardId);
    if (selfCard) {
      const tracker = cardTrackerByCardId.get(idToKey(selfCard.cardId));
      viewedSelfCard = {
        card: selfCard,
        tracker,
        actionState: deriveActionState(actionByCardId.get(idToKey(selfCard.cardId))),
        definition: lookupDefinition?.(selfCard.definitionId),
      };
    }
  }

  const viewedCardTracker = cardTrackerByCardId.get(idToKey(viewedCardId));
  const viewedTileTracker =
    viewedCardTracker && viewedCardTracker.linkedTileId !== ZERO_ID
      ? trackerByTileId.get(idToKey(viewedCardTracker.linkedTileId))
      : undefined;

  const worldTiles = snapshot.tileTrackers
    .map((tracker) => {
      const tile = tileById.get(idToKey(tracker.tileId));
      if (!tile || tile.tileType !== "world") {
        return undefined;
      }
      return {
        tile,
        tracker,
        attachedCards: attachedCardsByTileId.get(idToKey(tile.tileId)) ?? [],
      };
    })
    .filter((tile) => tile !== undefined);

  const eventTiles = snapshot.eventTrackers
    .map((eventTracker) => {
      const tile = tileById.get(idToKey(eventTracker.tileId));
      if (!tile || tile.tileType !== "event" || eventTracker.cardId !== viewedCardId) {
        return undefined;
      }
      return {
        tile,
        tracker: trackerByTileId.get(idToKey(tile.tileId)),
        attachedCards: attachedCardsByTileId.get(idToKey(tile.tileId)) ?? [],
        createTime: Number(eventTracker.createTime),
      };
    })
    .filter((tile) => tile !== undefined)
    .sort((a, b) => a.createTime - b.createTime);

  const slotTiles = snapshot.slotTrackers
    .map((slotTracker) => {
      if (slotTracker.cardId !== viewedCardId) {
        return undefined;
      }
      const tile = tileById.get(idToKey(slotTracker.tileId));
      if (!tile || tile.tileType !== "slot") {
        return undefined;
      }
      return {
        tile,
        tracker: trackerByTileId.get(idToKey(tile.tileId)),
        attachedCards: attachedCardsByTileId.get(idToKey(tile.tileId)) ?? [],
        q: slotTracker.q,
        r: slotTracker.r,
      };
    })
    .filter((tile) => tile !== undefined);

  return {
    observerCardId,
    viewedCardId,
    viewedSelfCard,
    viewedCardTracker,
    viewedTileTracker,
    worldTiles,
    eventTiles,
    slotTiles,
    inventories,
  };
};
