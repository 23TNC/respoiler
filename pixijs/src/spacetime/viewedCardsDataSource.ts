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
  private activeSubscriptions: SubscriptionHandle[] = [];
  private tileSubscription?: SubscriptionHandle;
  private currentViewedCardId?: bigint;
  private currentLinkedTileId = 0;
  private readonly refreshSnapshotBound = (): void => {
    this.refreshSnapshot("table-event");
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
    this.connection.db.card.removeOnInsert(this.refreshSnapshotBound);
    this.connection.db.card.removeOnUpdate(this.refreshSnapshotBound);
    this.connection.db.card.removeOnDelete(this.refreshSnapshotBound);
    this.connection.db.card_tracker.removeOnInsert(this.refreshSnapshotBound);
    this.connection.db.card_tracker.removeOnUpdate(this.refreshSnapshotBound);
    this.connection.db.card_tracker.removeOnDelete(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.removeOnInsert(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.removeOnUpdate(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.removeOnDelete(this.refreshSnapshotBound);
    this.activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.activeSubscriptions = [];
    this.tileSubscription?.unsubscribe();
    this.tileSubscription = undefined;
    this.currentLinkedTileId = 0;

    const cardQuery = `select * from card where card_id = ${viewedCardId.toString()}`;
    const cardTrackerQuery = `select * from card_tracker where card_id = ${viewedCardId.toString()}`;
    console.info("[ui-debug] creating viewed-card subscriptions", {
      viewedCardId,
      cardQuery,
      cardTrackerQuery,
    });

    this.connection.db.card.onInsert(this.refreshSnapshotBound);
    this.connection.db.card.onUpdate(this.refreshSnapshotBound);
    this.connection.db.card.onDelete(this.refreshSnapshotBound);
    this.connection.db.card_tracker.onInsert(this.refreshSnapshotBound);
    this.connection.db.card_tracker.onUpdate(this.refreshSnapshotBound);
    this.connection.db.card_tracker.onDelete(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.onInsert(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.onUpdate(this.refreshSnapshotBound);
    this.connection.db.tile_tracker.onDelete(this.refreshSnapshotBound);

    const refreshInitial = (): void => {
      this.refreshSnapshot("initial");
    };
    this.activeSubscriptions = [
      this.connection.subscriptionBuilder().onApplied(refreshInitial).subscribe(cardQuery),
      this.connection.subscriptionBuilder().onApplied(refreshInitial).subscribe(cardTrackerQuery),
    ];
  }

  dispose(): void {
    this.connection?.db.card.removeOnInsert(this.refreshSnapshotBound);
    this.connection?.db.card.removeOnUpdate(this.refreshSnapshotBound);
    this.connection?.db.card.removeOnDelete(this.refreshSnapshotBound);
    this.connection?.db.card_tracker.removeOnInsert(this.refreshSnapshotBound);
    this.connection?.db.card_tracker.removeOnUpdate(this.refreshSnapshotBound);
    this.connection?.db.card_tracker.removeOnDelete(this.refreshSnapshotBound);
    this.connection?.db.tile_tracker.removeOnInsert(this.refreshSnapshotBound);
    this.connection?.db.tile_tracker.removeOnUpdate(this.refreshSnapshotBound);
    this.connection?.db.tile_tracker.removeOnDelete(this.refreshSnapshotBound);
    this.activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.activeSubscriptions = [];
    this.tileSubscription?.unsubscribe();
    this.tileSubscription = undefined;
    this.currentLinkedTileId = 0;
  }

  private refreshSnapshot(reason: "initial" | "table-event"): void {
    if (!this.connection || this.currentViewedCardId === undefined) {
      return;
    }

    const viewedCardId = this.currentViewedCardId;
    const cards = Array.from(this.connection.db.card.iter()).filter(
      (card) => card.cardId.toString() === viewedCardId.toString(),
    );

    const cardTracker = Array.from(this.connection.db.card_tracker.iter()).find(
      (tracker) => tracker.cardId.toString() === viewedCardId.toString(),
    );
    const tileTracker =
      cardTracker && cardTracker.linkedTileId !== 0
        ? Array.from(this.connection.db.tile_tracker.iter()).find(
            (tracker) => tracker.tileId === cardTracker.linkedTileId,
          )
        : undefined;
    const linkedTileId = cardTracker?.linkedTileId ?? 0;
    this.updateTileSubscription(linkedTileId);

    console.info("[ui-debug] viewed cards snapshot applied", {
      reason,
      viewedCardId,
      cards,
      cardTracker,
      tileTracker,
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
      cardTrackers: cardTracker ? [cardTracker] : [],
      tileTrackers: tileTracker ? [tileTracker] : [],
    };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  private updateTileSubscription(linkedTileId: number): void {
    if (!this.connection || this.currentLinkedTileId === linkedTileId) {
      return;
    }

    this.currentLinkedTileId = linkedTileId;
    this.tileSubscription?.unsubscribe();
    this.tileSubscription = undefined;

    if (linkedTileId === 0) {
      return;
    }

    const tileTrackerQuery = `select * from tile_tracker where tile_id = ${linkedTileId.toString()}`;
    this.tileSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => this.refreshSnapshot("initial"))
      .subscribe(tileTrackerQuery);
  }
}
