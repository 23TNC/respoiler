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
  private currentViewedCardId?: bigint;
  private readonly refreshCardsBound = (): void => {
    this.refreshCards("table-event");
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
    this.connection.db.card.removeOnInsert(this.refreshCardsBound);
    this.connection.db.card.removeOnUpdate(this.refreshCardsBound);
    this.connection.db.card.removeOnDelete(this.refreshCardsBound);
    this.activeCardSubscription?.unsubscribe();

    const query = `select * from card where owner_card_id = ${viewedCardId.toString()} or card_id = ${viewedCardId.toString()}`;
    console.info("[ui-debug] creating card subscription", {
      viewedCardId,
      query,
    });

    this.connection.db.card.onInsert(this.refreshCardsBound);
    this.connection.db.card.onUpdate(this.refreshCardsBound);
    this.connection.db.card.onDelete(this.refreshCardsBound);

    this.activeCardSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.refreshCards("initial");
      })
      .subscribe(query);
  }

  dispose(): void {
    this.connection?.db.card.removeOnInsert(this.refreshCardsBound);
    this.connection?.db.card.removeOnUpdate(this.refreshCardsBound);
    this.connection?.db.card.removeOnDelete(this.refreshCardsBound);
    this.activeCardSubscription?.unsubscribe();
    this.activeCardSubscription = undefined;
  }

  private refreshCards(reason: "initial" | "table-event"): void {
    if (!this.connection || this.currentViewedCardId === undefined) {
      return;
    }

    const viewedCardId = this.currentViewedCardId;
    const cards = Array.from(this.connection.db.card.iter()).filter(
      (card) =>
        card.ownerCardId.toString() === viewedCardId.toString() ||
        card.cardId.toString() === viewedCardId.toString(),
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
    };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
