import { type GameDataSource } from "../game";
import type { GameViewSnapshot } from "../game/model";
import { type Card, type DbConnection, type SubscriptionHandle } from "./bindings";

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
  private readonly cardsById = new Map<bigint, Card>();

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
    this.unbindCardObservers();
    this.activeCardSubscription?.unsubscribe();
    this.activeCardSubscription = undefined;

    this.cardsById.clear();
    this.rebuildSnapshotFromState("switch-viewed-card");

    const query = this.buildCardQuery(viewedCardId);
    console.info("[ui-debug] creating card subscription", {
      viewedCardId,
      query,
    });

    this.connection.db.card.onInsert(this.syncCardsFromSubscriptionBound);
    this.connection.db.card.onUpdate(this.syncCardsFromSubscriptionBound);
    this.connection.db.card.onDelete(this.syncCardsFromSubscriptionBound);

    this.activeCardSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        console.info("[ui-debug] card subscription applied", {
          viewedCardId,
        });
        this.syncCardsFromSubscription("initial-applied");
      })
      .subscribe(query);
  }

  dispose(): void {
    console.info("[ui-debug] disposing card subscription", {
      viewedCardId: this.currentViewedCardId,
    });
    this.unbindCardObservers();
    this.activeCardSubscription?.unsubscribe();
    this.activeCardSubscription = undefined;
    this.cardsById.clear();
    this.snapshot = EMPTY_SNAPSHOT;
  }

  private buildCardQuery(viewedCardId: bigint): string {
    const viewedCardSql = viewedCardId.toString();
    return `select * from card where owner_card_id = ${viewedCardSql} or card_id = ${viewedCardSql}`;
  }

  private unbindCardObservers(): void {
    if (!this.connection) {
      return;
    }

    this.connection.db.card.removeOnInsert(this.syncCardsFromSubscriptionBound);
    this.connection.db.card.removeOnUpdate(this.syncCardsFromSubscriptionBound);
    this.connection.db.card.removeOnDelete(this.syncCardsFromSubscriptionBound);
  }

  private readonly syncCardsFromSubscriptionBound = (): void => {
    this.syncCardsFromSubscription("table-event");
  };

  private syncCardsFromSubscription(reason: "initial-applied" | "table-event"): void {
    if (!this.connection || this.currentViewedCardId === undefined) {
      return;
    }

    const viewedCardId = this.currentViewedCardId;
    const subscribedRows = Array.from(this.connection.db.card.iter());
    const relevantCards = subscribedRows.filter((card) => this.isCardRelevant(card, viewedCardId));

    const nextCardsById = new Map<bigint, Card>();
    for (const card of relevantCards) {
      nextCardsById.set(card.cardId, card);
    }

    const inserted = Array.from(nextCardsById.values()).filter((row) => !this.cardsById.has(row.cardId));
    const deleted = Array.from(this.cardsById.values()).filter((row) => !nextCardsById.has(row.cardId));
    const updated = Array.from(nextCardsById.values()).filter((row) => {
      const previous = this.cardsById.get(row.cardId);
      if (!previous) {
        return false;
      }

      return (
        previous.ownerCardId !== row.ownerCardId ||
        previous.definitionId !== row.definitionId ||
        previous.cardType !== row.cardType
      );
    });

    inserted.forEach((row) => {
      console.info("[ui-debug] card onInsert", {
        viewedCardId,
        cardId: row.cardId,
        ownerCardId: row.ownerCardId,
        definitionId: row.definitionId,
        cardType: row.cardType,
      });
    });

    deleted.forEach((row) => {
      console.info("[ui-debug] card onDelete", {
        viewedCardId,
        cardId: row.cardId,
      });
    });

    updated.forEach((row) => {
      const previous = this.cardsById.get(row.cardId);
      console.info("[ui-debug] card onUpdate", {
        viewedCardId,
        cardId: row.cardId,
        previous,
        next: row,
      });
    });

    this.cardsById.clear();
    nextCardsById.forEach((card, cardId) => {
      this.cardsById.set(cardId, card);
    });

    console.info("[ui-debug] processed card subscription state", {
      viewedCardId,
      reason,
      subscribedRowCount: subscribedRows.length,
      relevantRowCount: relevantCards.length,
      insertedCount: inserted.length,
      updatedCount: updated.length,
      deletedCount: deleted.length,
    });

    this.rebuildSnapshotFromState(reason);
  }

  private rebuildSnapshotFromState(reason: string): void {
    const cards = Array.from(this.cardsById.values());

    const groupedCounts = {
      cardType1Discipline: cards.filter((card) => card.cardType === 1).length,
      cardType2Faculty: cards.filter((card) => card.cardType === 2).length,
      cardType3Requisite: cards.filter((card) => card.cardType === 3).length,
      cardType4Reverie: cards.filter((card) => card.cardType === 4).length,
      cardType5Soul: cards.filter((card) => card.cardType === 5).length,
    };

    console.info("[ui-debug] inventory recompute from subscribed cards", {
      viewedCardId: this.currentViewedCardId,
      reason,
      groupedCounts,
      totalCards: cards.length,
    });

    this.snapshot = {
      ...EMPTY_SNAPSHOT,
      cards,
    };
    this.notify();
  }

  private isCardRelevant(card: Card, viewedCardId: bigint): boolean {
    return card.ownerCardId === viewedCardId || card.cardId === viewedCardId;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
