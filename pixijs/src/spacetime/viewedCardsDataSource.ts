import { type GameDataSource } from "../game";
import type { GameViewSnapshot } from "../game/model";
import { type DbConnection, type SubscriptionHandle } from "./bindings";

const EMPTY_SNAPSHOT: GameViewSnapshot = {
  players: [],
  cards: [],
  cardTrackers: [],
  actionTrackers: [],
  tiles: [],
  tileTrackers: [],
  eventTrackers: [],
  slotTrackers: [],
};

export class ViewedCardsDataSource implements GameDataSource {
  private snapshot: GameViewSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private activeCardSubscription?: SubscriptionHandle;
  private activeCardTrackerSubscription?: SubscriptionHandle;
  private activeTileTrackerSubscription?: SubscriptionHandle;
  private activeTileSubscription?: SubscriptionHandle;
  private currentViewedCardId?: bigint;
  private currentLinkedTileId?: bigint;
  private readonly refreshCardsBound = (): void => {
    this.refreshViewData("table-event");
  };
  private readonly refreshCardTrackerBound = (): void => {
    this.refreshViewData("table-event");
  };
  private readonly refreshTileTrackerBound = (): void => {
    this.refreshViewData("table-event");
  };
  private readonly refreshTileBound = (): void => {
    this.refreshViewData("table-event");
  };

  constructor(private readonly connection: DbConnection | null) {}

  getSnapshot(): GameViewSnapshot {
    return this.snapshot;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => {
      this.listeners.delete(onChange);
    };
  }

  setViewedCardId(viewedCardId: bigint): void {
    if (!this.connection) {
      return;
    }

    if (this.currentViewedCardId === viewedCardId) {
      return;
    }

    this.currentViewedCardId = viewedCardId;
    this.detachTableListeners();
    this.unsubscribeActiveSubscriptions();
    this.currentLinkedTileId = undefined;
    this.attachTableListeners();

    const query = `select * from card where owner_card_id = ${viewedCardId.toString()} or card_id = ${viewedCardId.toString()}`;
    console.info("[ui-debug] creating card subscription", {
      viewedCardId,
      query,
    });

    this.activeCardSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.refreshViewData("initial");
      })
      .subscribe(query);

    const cardTrackerQuery = `select * from card_tracker where card_id = ${viewedCardId.toString()}`;
    this.activeCardTrackerSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.refreshViewData("initial");
      })
      .subscribe(cardTrackerQuery);
  }

  dispose(): void {
    this.detachTableListeners();
    this.unsubscribeActiveSubscriptions();
  }

  private attachTableListeners(): void {
    if (!this.connection) {
      return;
    }

    this.connection.db.card.onInsert(this.refreshCardsBound);
    this.connection.db.card.onUpdate(this.refreshCardsBound);
    this.connection.db.card.onDelete(this.refreshCardsBound);
    this.connection.db.card_tracker.onInsert(this.refreshCardTrackerBound);
    this.connection.db.card_tracker.onUpdate(this.refreshCardTrackerBound);
    this.connection.db.card_tracker.onDelete(this.refreshCardTrackerBound);
    this.connection.db.tile_tracker.onInsert(this.refreshTileTrackerBound);
    this.connection.db.tile_tracker.onUpdate(this.refreshTileTrackerBound);
    this.connection.db.tile_tracker.onDelete(this.refreshTileTrackerBound);
    this.connection.db.tile.onInsert(this.refreshTileBound);
    this.connection.db.tile.onUpdate(this.refreshTileBound);
    this.connection.db.tile.onDelete(this.refreshTileBound);
  }

  private detachTableListeners(): void {
    if (!this.connection) {
      return;
    }

    this.connection.db.card.removeOnInsert(this.refreshCardsBound);
    this.connection.db.card.removeOnUpdate(this.refreshCardsBound);
    this.connection.db.card.removeOnDelete(this.refreshCardsBound);
    this.connection.db.card_tracker.removeOnInsert(this.refreshCardTrackerBound);
    this.connection.db.card_tracker.removeOnUpdate(this.refreshCardTrackerBound);
    this.connection.db.card_tracker.removeOnDelete(this.refreshCardTrackerBound);
    this.connection.db.tile_tracker.removeOnInsert(this.refreshTileTrackerBound);
    this.connection.db.tile_tracker.removeOnUpdate(this.refreshTileTrackerBound);
    this.connection.db.tile_tracker.removeOnDelete(this.refreshTileTrackerBound);
    this.connection.db.tile.removeOnInsert(this.refreshTileBound);
    this.connection.db.tile.removeOnUpdate(this.refreshTileBound);
    this.connection.db.tile.removeOnDelete(this.refreshTileBound);
  }

  private unsubscribeActiveSubscriptions(): void {
    this.activeCardSubscription?.unsubscribe();
    this.activeCardTrackerSubscription?.unsubscribe();
    this.activeTileTrackerSubscription?.unsubscribe();
    this.activeTileSubscription?.unsubscribe();
    this.activeCardSubscription = undefined;
    this.activeCardTrackerSubscription = undefined;
    this.activeTileTrackerSubscription = undefined;
    this.activeTileSubscription = undefined;
  }

  private refreshViewData(reason: "initial" | "table-event"): void {
    if (!this.connection || this.currentViewedCardId === undefined) {
      return;
    }

    const viewedCardId = this.currentViewedCardId;
    const cards = Array.from(this.connection.db.card.iter()).filter(
      (card) =>
        card.ownerCardId.toString() === viewedCardId.toString() ||
        card.cardId.toString() === viewedCardId.toString(),
    );

    const cardTrackers = Array.from(this.connection.db.card_tracker.iter()).filter(
      (tracker) => tracker.cardId.toString() === viewedCardId.toString(),
    );
    const viewedCardTracker = cardTrackers[0];
    const linkedTileId = viewedCardTracker ? BigInt(viewedCardTracker.linkedTileId) : undefined;

    this.ensureLinkedTileSubscriptions(linkedTileId);

    const tileTrackers = linkedTileId === undefined
      ? []
      : Array.from(this.connection.db.tile_tracker.iter()).filter(
        (tracker) => tracker.tileId.toString() === linkedTileId.toString(),
      );
    const tiles = linkedTileId === undefined
      ? []
      : Array.from(this.connection.db.tile.iter()).filter(
        (tile) => tile.tileId.toString() === linkedTileId.toString(),
      );

    console.info("[ui-debug] card subscription applied", {
      reason,
      viewedCardId,
      returnedRows: cards,
    });

    const groupedCounts = {
      cardType1Discipline: cards.filter((card) => card.cardType === 1).length,
      cardType2Faculty: cards.filter((card) => card.cardType === 2).length,
      cardType3Requisite: cards.filter((card) => card.cardType === 3).length,
      cardType4Reverie: cards.filter((card) => card.cardType === 4).length,
      cardType5Soul: cards.filter((card) => card.cardType === 5).length,
    };
    console.info("[ui-debug] grouped inventory counts by card_type", {
      viewedCardId,
      groupedCounts,
    });

    this.snapshot = {
      ...EMPTY_SNAPSHOT,
      cards,
      cardTrackers,
      tileTrackers,
      tiles,
    };
    this.notify();
  }

  private ensureLinkedTileSubscriptions(linkedTileId: bigint | undefined): void {
    if (!this.connection) {
      return;
    }

    const hasValidLinkedTile = linkedTileId !== undefined && linkedTileId !== 0n;
    const effectiveLinkedTileId = hasValidLinkedTile ? linkedTileId : undefined;
    if (this.currentLinkedTileId === effectiveLinkedTileId) {
      return;
    }

    this.currentLinkedTileId = effectiveLinkedTileId;
    this.activeTileTrackerSubscription?.unsubscribe();
    this.activeTileSubscription?.unsubscribe();
    this.activeTileTrackerSubscription = undefined;
    this.activeTileSubscription = undefined;

    if (effectiveLinkedTileId === undefined) {
      return;
    }

    const linkedTileIdString = effectiveLinkedTileId.toString();
    this.activeTileTrackerSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.refreshViewData("table-event");
      })
      .subscribe(`select * from tile_tracker where tile_id = ${linkedTileIdString}`);

    this.activeTileSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.refreshViewData("table-event");
      })
      .subscribe(`select * from tile where tile_id = ${linkedTileIdString}`);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
