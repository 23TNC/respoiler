import type { GameViewSnapshot } from "../model";

export type GameDataSource = {
  getSnapshot: () => GameViewSnapshot;
  subscribe?: (onChange: () => void) => () => void;
  destroy?: () => void;
  getIdentityState?: () => { observerCardId: bigint | number; viewedCardId: bigint | number };
};

export class GameDataStore {
  private snapshot: GameViewSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(initialSnapshot?: Partial<GameViewSnapshot>) {
    this.snapshot = {
      players: [],
      soulAlignments: [],
      cards: [],
      cardTrackers: [],
      actionTrackers: [],
      tiles: [],
      tileTrackers: [],
      eventTrackers: [],
      slotTrackers: [],
      ...initialSnapshot,
    };
  }

  getSnapshot(): GameViewSnapshot {
    return this.snapshot;
  }

  setSnapshot(snapshot: GameViewSnapshot): void {
    this.snapshot = snapshot;
    this.notify();
  }

  connect(dataSource: GameDataSource): () => void {
    this.setSnapshot(dataSource.getSnapshot());
    if (!dataSource.subscribe) {
      return () => dataSource.destroy?.();
    }

    const unsubscribe = dataSource.subscribe(() => {
      this.setSnapshot(dataSource.getSnapshot());
    });

    return () => {
      unsubscribe();
      dataSource.destroy?.();
    };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
