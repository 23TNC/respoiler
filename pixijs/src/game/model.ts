import type {
  ActionTracker,
  Card,
  CardTracker,
  EventTracker,
  Player,
  SlotTracker,
} from "../spacetime/bindings/types";

export type CardCategory = "action" | "skill" | "item" | "memory" | "soul";
export type EntityId = bigint | number;

export type DefinitionInfo = {
  name: string;
  topColor: number;
  bottomColor: number;
};

export type DefinitionLookup = (cardType: number, definitionId: EntityId) => DefinitionInfo | undefined;

export type TrackedCard = {
  card: Card;
  tracker?: CardTracker;
  actionState: "staged" | "queued" | "running" | "complete";
  definition?: DefinitionInfo;
};

export type TrackedTile = {
  tile: Card;
  tracker?: CardTracker;
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
  eventTrackers: EventTracker[];
  slotTrackers: SlotTracker[];
};

export type DerivedGameViewModel = {
  observerCardId: EntityId;
  viewedCardId: EntityId;
  viewedSelfCard?: TrackedCard;
  viewedCardTracker?: CardTracker;
  viewedPositionCards: TrackedCard[];
  viewedWorldTile?: TrackedTile;
  viewedWorldTracker?: CardTracker;
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
  const cardTrackerByCardId = new Map(snapshot.cardTrackers.map((tracker) => [idToKey(tracker.cardId), tracker]));
  const actionByCardId = new Map(snapshot.actionTrackers.map((action) => [idToKey(action.cardId), action]));
  const cardById = new Map(snapshot.cards.map((card) => [idToKey(card.cardId), card]));
  const trackedCardById = new Map<string, TrackedCard>();
  const attachedCardsByPosition = new Map<string, TrackedCard[]>();
  const makePositionKey = (tracker: CardTracker): string => `${tracker.q}:${tracker.r}:${tracker.z}`;
  const getOrCreatePositionCards = (tracker: CardTracker): TrackedCard[] => {
    const key = makePositionKey(tracker);
    const existing = attachedCardsByPosition.get(key);
    if (existing) {
      return existing;
    }
    const next: TrackedCard[] = [];
    attachedCardsByPosition.set(key, next);
    return next;
  };

  const ownedCards = snapshot.cards.filter((card) => card.ownerCardId === viewedCardId);

  const trackedOwnedCards: TrackedCard[] = ownedCards.map((card) => {
    const tracker = cardTrackerByCardId.get(idToKey(card.cardId));
    const trackedCard: TrackedCard = {
      card,
      tracker,
      actionState: deriveActionState(actionByCardId.get(idToKey(card.cardId))),
      definition: lookupDefinition?.(card.cardType, card.definitionId),
    };

    trackedCardById.set(idToKey(card.cardId), trackedCard);

    if (tracker) {
      getOrCreatePositionCards(tracker).push(trackedCard);
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
        definition: lookupDefinition?.(selfCard.cardType, selfCard.definitionId),
      };
      trackedCardById.set(idToKey(selfCard.cardId), viewedSelfCard);
      if (tracker) {
        getOrCreatePositionCards(tracker).push(viewedSelfCard);
      }
    }
  }

  const viewedCardTracker = cardTrackerByCardId.get(idToKey(viewedCardId));
  const viewedPositionCards = viewedCardTracker
    ? snapshot.cardTrackers
        .filter(
          (tracker) =>
            tracker.q === viewedCardTracker.q &&
            tracker.r === viewedCardTracker.r &&
            tracker.z === viewedCardTracker.z,
        )
        .map((tracker) => {
          const key = idToKey(tracker.cardId);
          const existing = trackedCardById.get(key);
          if (existing) {
            return existing;
          }
          const card = cardById.get(key);
          if (!card) {
            return undefined;
          }
          const tracked: TrackedCard = {
            card,
            tracker,
            actionState: deriveActionState(actionByCardId.get(key)),
            definition: lookupDefinition?.(card.cardType, card.definitionId),
          };
          trackedCardById.set(key, tracked);
          getOrCreatePositionCards(tracker).push(tracked);
          return tracked;
        })
        .filter((trackedCard) => trackedCard !== undefined)
    : [];

  const viewedWorldCard = viewedPositionCards.find((trackedCard) => trackedCard.card.cardType === 6);
  const viewedWorldTracker = viewedWorldCard?.tracker;

  const worldTiles = snapshot.cards
    .filter((card) => card.cardType === 6)
    .map((tileCard) => {
      const tileTracker = cardTrackerByCardId.get(idToKey(tileCard.cardId));
      return {
        tile: tileCard,
        tracker: tileTracker,
        attachedCards: tileTracker ? getOrCreatePositionCards(tileTracker) : [],
      };
    })
    .filter((tile) => tile !== undefined);

  const viewedWorldTile = viewedWorldCard
    ? worldTiles.find((tile) => idToKey(tile.tile.cardId) === idToKey(viewedWorldCard.card.cardId))
    : undefined;

  const eventTiles = snapshot.eventTrackers
    .map((eventTracker) => {
      const tile = cardById.get(idToKey(eventTracker.tileId));
      if (!tile || tile.cardType !== 7 || eventTracker.cardId !== viewedCardId) {
        return undefined;
      }
      const tileTracker = cardTrackerByCardId.get(idToKey(tile.cardId));
      return {
        tile,
        tracker: tileTracker,
        attachedCards: tileTracker ? getOrCreatePositionCards(tileTracker) : [],
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
      const tile = cardById.get(idToKey(slotTracker.tileId));
      if (!tile || tile.cardType !== 8) {
        return undefined;
      }
      const tileTracker = cardTrackerByCardId.get(idToKey(tile.cardId));
      return {
        tile,
        tracker: tileTracker,
        attachedCards: tileTracker ? getOrCreatePositionCards(tileTracker) : [],
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
    viewedPositionCards,
    viewedWorldTile,
    viewedWorldTracker,
    worldTiles,
    eventTiles,
    slotTiles,
    inventories,
  };
};
