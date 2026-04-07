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
    this.activeCardSubscription?.unsubscribe();

    const query = `select * from card where owner_card_id = ${viewedCardId.toString()}`;
    console.info("[ui-debug] creating card subscription", {
      viewedCardId,
      query,
    });

    this.activeCardSubscription = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        const cards = Array.from(this.connection!.db.card.iter());
        console.info("[ui-debug] card subscription applied", {
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
      })
      .subscribe(query);
  }

  dispose(): void {
    this.activeCardSubscription?.unsubscribe();
    this.activeCardSubscription = undefined;
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
