import { type GameDataSource } from "../game";
import type { GameViewSnapshot } from "../game/model";
import { type DbConnection, type SubscriptionHandle } from "./bindings";

const EMPTY_SNAPSHOT: GameViewSnapshot = {
  players: [],
  cards: [],
  cardTrackers: [],
  actionTrackers: [],
  eventTrackers: [],
  slotTrackers: [],
};

export class ViewedCardsDataSource implements GameDataSource {
  private snapshot: GameViewSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<() => void>();
  private activeSubscriptions: SubscriptionHandle[] = [];
  private currentViewedCardId?: bigint;
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
    this.activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.activeSubscriptions = [];

    const cardQuery = "select * from card";
    const cardTrackerQuery = "select * from card_tracker";
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
    this.activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
    this.activeSubscriptions = [];
  }

  private refreshSnapshot(reason: "initial" | "table-event"): void {
    if (!this.connection || this.currentViewedCardId === undefined) {
      return;
    }

    const viewedCardId = this.currentViewedCardId;
    const allCards = Array.from(this.connection.db.card.iter());
    const allTrackers = Array.from(this.connection.db.card_tracker.iter());
    const viewedSoulTracker = allTrackers.find((tracker) => tracker.cardId.toString() === viewedCardId.toString());

    const positionTrackers = viewedSoulTracker
      ? allTrackers.filter(
          (tracker) =>
            tracker.q === viewedSoulTracker.q &&
            tracker.r === viewedSoulTracker.r &&
            tracker.z === viewedSoulTracker.z,
        )
      : [];

    const positionCardIds = new Set(positionTrackers.map((tracker) => tracker.cardId.toString()));

    const cards = allCards.filter((card) => {
      if (card.cardId.toString() === viewedCardId.toString()) {
        return true;
      }
      if (card.ownerCardId.toString() === viewedCardId.toString()) {
        return true;
      }
      return positionCardIds.has(card.cardId.toString());
    });

    const cardTrackers = allTrackers.filter((tracker) => {
      if (tracker.cardId.toString() === viewedCardId.toString()) {
        return true;
      }
      if (tracker.linkedCardId.toString() === viewedCardId.toString()) {
        return true;
      }
      return positionCardIds.has(tracker.cardId.toString());
    });

    console.info("[ui-debug] viewed cards snapshot applied", {
      reason,
      viewedCardId,
      viewedSoulTracker,
      positionTrackers,
      cards,
      cardTrackers,
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
    };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
