import { DbConnection } from "./bindings";
import type {
  ActionTracker,
  Card,
  CardTracker,
  EventTracker,
  Player,
  SlotTracker,
  SoulAlignment,
  Tile,
  TileTracker,
} from "./bindings/types";
import type { EntityId, GameViewSnapshot } from "../game";
import { idToKey } from "../game/model";

type Listener = () => void;

type LiveGameDataSourceConfig = {
  playerId: EntityId;
  uri?: string;
  moduleName?: string;
  token?: string;
};

const DEFAULT_URI = "ws://localhost:3000";
const DEFAULT_MODULE = "respoiler";
const TABLE_QUERIES = [
  "SELECT * FROM player",
  "SELECT * FROM soul_alignment",
  "SELECT * FROM tile",
  "SELECT * FROM tile_tracker",
  "SELECT * FROM event_tracker",
  "SELECT * FROM slot_tracker",
  "SELECT * FROM card",
  "SELECT * FROM card_tracker",
  "SELECT * FROM action_tracker",
];

export class LiveGameDataSource {
  private readonly listeners = new Set<Listener>();

  private readonly players = new Map<string, Player>();
  private readonly soulAlignments = new Map<string, SoulAlignment>();
  private readonly tiles = new Map<string, Tile>();
  private readonly tileTrackers = new Map<string, TileTracker>();
  private readonly eventTrackers = new Map<string, EventTracker>();
  private readonly slotTrackers = new Map<string, SlotTracker>();
  private readonly cards = new Map<string, Card>();
  private readonly cardTrackers = new Map<string, CardTracker>();
  private readonly actionTrackers = new Map<string, ActionTracker>();

  private connection?: DbConnection;
  private disconnect?: () => void;

  private readonly rootPlayerId: EntityId;
  private observerCardId: EntityId = 0n;
  private viewedCardId: EntityId = 0n;

  constructor(config: LiveGameDataSourceConfig) {
    this.rootPlayerId = config.playerId;

    const builder = DbConnection.builder();
    const builderAny = builder as unknown as {
      withUri?: (uri: string) => unknown;
      withModuleName?: (moduleName: string) => unknown;
      withToken?: (token: string) => unknown;
      onConnect?: (cb: (connection: DbConnection) => void) => unknown;
      onDisconnect?: (cb: () => void) => unknown;
      onConnectError?: (cb: (context: unknown, error: unknown) => void) => unknown;
      build?: () => DbConnection;
    };

    builderAny.withUri?.(config.uri ?? DEFAULT_URI);
    builderAny.withModuleName?.(config.moduleName ?? DEFAULT_MODULE);
    if (config.token) {
      builderAny.withToken?.(config.token);
    }

    builderAny.onConnect?.((connection) => {
      console.info("[spacetime] connected");
      this.bindTableHandlers(connection);
      this.applySubscriptions(connection);
    });
    builderAny.onDisconnect?.(() => {
      console.info("[spacetime] disconnected");
    });
    builderAny.onConnectError?.((_ctx, error) => {
      console.error("[spacetime] connect error", error);
    });

    if (!builderAny.build) {
      throw new Error("Spacetime builder missing build method.");
    }
    this.connection = builderAny.build();
  }

  getSnapshot(): GameViewSnapshot {
    return {
      players: [...this.players.values()],
      soulAlignments: [...this.soulAlignments.values()],
      cards: [...this.cards.values()],
      cardTrackers: [...this.cardTrackers.values()],
      actionTrackers: [...this.actionTrackers.values()],
      tiles: [...this.tiles.values()],
      tileTrackers: [...this.tileTrackers.values()],
      eventTrackers: [...this.eventTrackers.values()],
      slotTrackers: [...this.slotTrackers.values()],
    };
  }

  getIdentityState(): { observerCardId: EntityId; viewedCardId: EntityId } {
    return {
      observerCardId: this.observerCardId,
      viewedCardId: this.viewedCardId,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.disconnect?.();
    this.connection = undefined;
    this.listeners.clear();
  }

  private bindTableHandlers(connection: DbConnection): void {
    const db = (connection as unknown as { db?: Record<string, unknown> }).db;
    if (!db) {
      console.warn("[spacetime] connection has no db accessor");
      return;
    }

    this.bindTable<Player>(db.player, {
      label: "player",
      keyForRow: (row) => idToKey(row.playerId),
      onUpsert: (row) => {
        this.players.set(idToKey(row.playerId), row);
        this.resolveIdentityFromPlayerTable();
      },
      onDelete: (row) => {
        this.players.delete(idToKey(row.playerId));
        this.resolveIdentityFromPlayerTable();
      },
    });

    this.bindTable<SoulAlignment>(db.soul_alignment, {
      label: "soul_alignment",
      keyForRow: (row) => idToKey(row.cardId),
      onUpsert: (row) => this.soulAlignments.set(idToKey(row.cardId), row),
      onDelete: (row) => this.soulAlignments.delete(idToKey(row.cardId)),
    });

    this.bindTable<Tile>(db.tile, {
      label: "tile",
      keyForRow: (row) => idToKey(row.tileId),
      onUpsert: (row) => this.tiles.set(idToKey(row.tileId), row),
      onDelete: (row) => this.tiles.delete(idToKey(row.tileId)),
    });

    this.bindTable<TileTracker>(db.tile_tracker, {
      label: "tile_tracker",
      keyForRow: (row) => idToKey(row.tileId),
      onUpsert: (row) => this.tileTrackers.set(idToKey(row.tileId), row),
      onDelete: (row) => this.tileTrackers.delete(idToKey(row.tileId)),
    });

    this.bindTable<EventTracker>(db.event_tracker, {
      label: "event_tracker",
      keyForRow: (row) => idToKey(row.tileId),
      onUpsert: (row) => this.eventTrackers.set(idToKey(row.tileId), row),
      onDelete: (row) => this.eventTrackers.delete(idToKey(row.tileId)),
    });

    this.bindTable<SlotTracker>(db.slot_tracker, {
      label: "slot_tracker",
      keyForRow: (row) => idToKey(row.tileId),
      onUpsert: (row) => this.slotTrackers.set(idToKey(row.tileId), row),
      onDelete: (row) => this.slotTrackers.delete(idToKey(row.tileId)),
    });

    this.bindTable<Card>(db.card, {
      label: "card",
      keyForRow: (row) => idToKey(row.cardId),
      onUpsert: (row) => this.cards.set(idToKey(row.cardId), row),
      onDelete: (row) => this.cards.delete(idToKey(row.cardId)),
    });

    this.bindTable<CardTracker>(db.card_tracker, {
      label: "card_tracker",
      keyForRow: (row) => idToKey(row.cardId),
      onUpsert: (row) => this.cardTrackers.set(idToKey(row.cardId), row),
      onDelete: (row) => this.cardTrackers.delete(idToKey(row.cardId)),
    });

    this.bindTable<ActionTracker>(db.action_tracker, {
      label: "action_tracker",
      keyForRow: (row) => idToKey(row.cardId),
      onUpsert: (row) => this.actionTrackers.set(idToKey(row.cardId), row),
      onDelete: (row) => this.actionTrackers.delete(idToKey(row.cardId)),
    });
  }

  private bindTable<Row>(
    tableRef: unknown,
    config: {
      label: string;
      keyForRow: (row: Row) => string;
      onUpsert: (row: Row) => void;
      onDelete: (row: Row) => void;
    },
  ): void {
    const table = tableRef as {
      onInsert?: (cb: (_ctx: unknown, row: Row) => void) => void;
      onUpdate?: (cb: (_ctx: unknown, oldRow: Row, newRow: Row) => void) => void;
      onDelete?: (cb: (_ctx: unknown, row: Row) => void) => void;
    };

    table.onInsert?.((_ctx, row) => {
      config.onUpsert(row);
      this.logTableEvent(config.label, "insert", config.keyForRow(row));
      this.emitChange();
    });
    table.onUpdate?.((_ctx, _oldRow, row) => {
      config.onUpsert(row);
      this.logTableEvent(config.label, "update", config.keyForRow(row));
      this.emitChange();
    });
    table.onDelete?.((_ctx, row) => {
      config.onDelete(row);
      this.logTableEvent(config.label, "delete", config.keyForRow(row));
      this.emitChange();
    });
  }

  private applySubscriptions(connection: DbConnection): void {
    const subscriptionBuilder = connection.subscriptionBuilder() as unknown as {
      onApplied?: (cb: () => void) => unknown;
      subscribe?: (queries: string[] | string) => { unsubscribe?: () => void } | void;
      subscribeToQueries?: (queries: string[]) => { unsubscribe?: () => void } | void;
      subscribeToAllTables?: () => { unsubscribe?: () => void } | void;
    };

    subscriptionBuilder.onApplied?.(() => {
      console.info("[spacetime] subscriptions applied");
      this.resolveIdentityFromPlayerTable();
      this.emitChange();
    });

    let handle:
      | {
          unsubscribe?: () => void;
        }
      | void;

    if (subscriptionBuilder.subscribe) {
      handle = subscriptionBuilder.subscribe(TABLE_QUERIES);
    } else if (subscriptionBuilder.subscribeToQueries) {
      handle = subscriptionBuilder.subscribeToQueries(TABLE_QUERIES);
    } else if (subscriptionBuilder.subscribeToAllTables) {
      console.warn("[spacetime] falling back to subscribeToAllTables");
      handle = subscriptionBuilder.subscribeToAllTables();
    }

    this.disconnect = () => {
      handle?.unsubscribe?.();
    };
  }

  private resolveIdentityFromPlayerTable(): void {
    const player = this.players.get(idToKey(this.rootPlayerId));
    if (!player) {
      return;
    }

    if (this.observerCardId !== player.cardId || this.viewedCardId !== player.cardId) {
      this.observerCardId = player.cardId;
      this.viewedCardId = player.cardId;
      console.info(
        "[spacetime] resolved player card",
        `player=${this.rootPlayerId.toString()}`,
        `card=${player.cardId.toString()}`,
      );
    }
  }

  private logTableEvent(table: string, eventType: "insert" | "update" | "delete", id: string): void {
    if (eventType === "update") {
      return;
    }
    console.debug(`[spacetime] ${table} ${eventType} ${id}`);
  }

  private emitChange(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const createLiveGameDataSource = (config: LiveGameDataSourceConfig) => {
  const source = new LiveGameDataSource(config);
  return {
    getSnapshot: () => source.getSnapshot(),
    subscribe: (onChange: () => void) => source.subscribe(onChange),
    destroy: () => source.destroy(),
    getIdentityState: () => source.getIdentityState(),
  };
};
