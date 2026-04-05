import { DbConnection, type SubscriptionHandle } from './bindings';

export interface SpacetimeRowsSnapshot {
  players: ReturnType<DbConnection['db']['player']['iter']> extends Iterable<infer T> ? T[] : never[];
  souls: ReturnType<DbConnection['db']['soul']['iter']> extends Iterable<infer T> ? T[] : never[];
  cards: ReturnType<DbConnection['db']['card']['iter']> extends Iterable<infer T> ? T[] : never[];
  worldTiles: ReturnType<DbConnection['db']['world_tile']['iter']> extends Iterable<infer T> ? T[] : never[];
  eventTiles: ReturnType<DbConnection['db']['event_tile']['iter']> extends Iterable<infer T> ? T[] : never[];
  attachments: ReturnType<DbConnection['db']['tile_technique_attachment']['iter']> extends Iterable<infer T> ? T[] : never[];
  recipeQueues: ReturnType<DbConnection['db']['recipe_queue']['iter']> extends Iterable<infer T> ? T[] : never[];
  recipeQueueCards: ReturnType<DbConnection['db']['recipe_queue_card']['iter']> extends Iterable<infer T> ? T[] : never[];
  cardReservations: ReturnType<DbConnection['db']['card_reservation']['iter']> extends Iterable<infer T> ? T[] : never[];
  activePlayerId: string | null;
  hasAppliedSubscription: boolean;
}

export interface SpacetimeClientConfig {
  uri: string;
  databaseName: string;
  token?: string;
}

const SUBSCRIPTION_SQL = [
  'SELECT * FROM player',
  'SELECT * FROM soul',
  'SELECT * FROM card',
  'SELECT * FROM world_tile',
  'SELECT * FROM event_tile',
  'SELECT * FROM tile_technique_attachment',
  'SELECT * FROM recipe_queue',
  'SELECT * FROM recipe_queue_card',
  'SELECT * FROM card_reservation',
];

export class SpacetimeClient {
  private connection: DbConnection | null = null;

  private subscriptionHandle: SubscriptionHandle | null = null;

  private listeners = new Set<(rows: SpacetimeRowsSnapshot) => void>();

  private bootstrapRequested = false;
  private hasAppliedSubscription = false;
  private rowListenersBound = false;
  private activePlayerKey: string | null = null;
  private activePlayerId: string | null = null;

  get isConnected(): boolean {
    return this.connection?.isActive ?? false;
  }

  getConnection(): DbConnection | null {
    return this.connection;
  }

  subscribe(listener: (rows: SpacetimeRowsSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshotRows());
    return () => this.listeners.delete(listener);
  }

  async connect(config: SpacetimeClientConfig): Promise<void> {
    if (this.connection) {
      return;
    }

    const builder = DbConnection.builder()
      .withUri(config.uri)
      .withDatabaseName(config.databaseName)
      .withToken(config.token)
      .onConnect(() => {
        this.bindRowListeners();
        this.notify();
      })
      .onConnectError((_ctx, error) => {
        console.error('SpaceTimeDB connection failed', error);
      })
      .onDisconnect((_ctx, error) => {
        console.warn('SpaceTimeDB disconnected', error);
      });

    this.connection = builder.build();
    this.hasAppliedSubscription = false;

    this.subscriptionHandle = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
        this.hasAppliedSubscription = true;
        this.notify();
      })
      .onError((_ctx) => {
        console.error('SpaceTimeDB subscription error');
      })
      .subscribe(SUBSCRIPTION_SQL);
  }

  disconnect(): void {
    this.subscriptionHandle?.unsubscribe();
    this.subscriptionHandle = null;
    this.connection?.disconnect();
    this.connection = null;
    this.hasAppliedSubscription = false;
    this.rowListenersBound = false;
  }

  async resolveTestPlayer(playerKey: string): Promise<void> {
    if (!this.connection) {
      return;
    }
    this.activePlayerKey = playerKey;
    await this.connection.reducers.resolveTestPlayer({ playerKey });
    this.refreshActivePlayerId();
    this.notify();
  }

  async bootstrapMinimalWorld(): Promise<void> {
    if (!this.connection || this.bootstrapRequested) {
      return;
    }
    this.bootstrapRequested = true;
    try {
      await this.connection.reducers.bootstrapMinimalWorld({});
    } finally {
      this.bootstrapRequested = false;
    }
  }

  async attachTechniqueToWorldTile(soulId: bigint, techniqueCardId: bigint, tileId: bigint): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.reducers.attachTechniqueToWorldTile({ soulId, techniqueCardId, tileId });
  }

  async attachTechniqueToEventTile(soulId: bigint, techniqueCardId: bigint, eventTileId: bigint): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.reducers.attachTechniqueToEventTile({ soulId, techniqueCardId, eventTileId });
  }

  async detachTechniqueFromHost(
    soulId: bigint,
    hostType: 'WorldTile' | 'EventTile',
    hostId: bigint,
  ): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.reducers.detachTechniqueFromHost({
      soulId,
      hostType: { tag: hostType },
      hostId,
    });
  }

  async queueRecipeOnHost(
    actorSoulId: bigint,
    hostType: 'WorldTile' | 'EventTile',
    hostId: bigint,
    recipeId: number,
    techniqueCardId: bigint,
    inputCardIds: bigint[],
  ): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.reducers.queueRecipeOnHost({
      actorSoulId,
      hostType: { tag: hostType },
      hostId,
      recipeId,
      techniqueCardId,
      inputCardIds,
    });
  }

  private bindRowListeners(): void {
    const db = this.connection?.db;
    if (!db || this.rowListenersBound) {
      return;
    }
    this.rowListenersBound = true;
    console.info('[SpacetimeClient] binding row listeners');

    const wire = <T>(table: {
      onInsert: (cb: (ctx: unknown, row: T) => void) => void;
      onDelete: (cb: (ctx: unknown, row: T) => void) => void;
      onUpdate?: (cb: (ctx: unknown, oldRow: T, newRow: T) => void) => void;
    }): void => {
      table.onInsert(() => this.notify());
      table.onDelete(() => this.notify());
      table.onUpdate?.(() => this.notify());
    };

    wire(db.player);
    wire(db.soul);
    wire(db.card);
    wire(db.world_tile);
    wire(db.event_tile);
    wire(db.tile_technique_attachment);
    wire(db.recipe_queue);
    wire(db.recipe_queue_card);
    wire(db.card_reservation);
  }

  private snapshotRows(): SpacetimeRowsSnapshot {
    if (!this.connection) {
      return {
        players: [],
        souls: [],
        cards: [],
        worldTiles: [],
        eventTiles: [],
        attachments: [],
        recipeQueues: [],
        recipeQueueCards: [],
        cardReservations: [],
        activePlayerId: null,
        hasAppliedSubscription: false,
      };
    }

    this.refreshActivePlayerId();

    return {
      players: Array.from(this.connection.db.player.iter()),
      souls: Array.from(this.connection.db.soul.iter()),
      cards: Array.from(this.connection.db.card.iter()),
      worldTiles: Array.from(this.connection.db.world_tile.iter()),
      eventTiles: Array.from(this.connection.db.event_tile.iter()),
      attachments: Array.from(this.connection.db.tile_technique_attachment.iter()),
      recipeQueues: Array.from(this.connection.db.recipe_queue.iter()),
      recipeQueueCards: Array.from(this.connection.db.recipe_queue_card.iter()),
      cardReservations: Array.from(this.connection.db.card_reservation.iter()),
      activePlayerId: this.activePlayerId,
      hasAppliedSubscription: this.hasAppliedSubscription,
    };
  }

  private refreshActivePlayerId(): void {
    if (!this.connection || !this.activePlayerKey) {
      this.activePlayerId = null;
      return;
    }

    const row = Array.from(this.connection.db.player.iter())
      .find((player) => player.playerKey === this.activePlayerKey);
    this.activePlayerId = row ? row.playerId.toString() : null;
  }

  private notify(): void {
    const rows = this.snapshotRows();
    this.listeners.forEach((listener) => listener(rows));
  }
}

export function createSpacetimeClient(): SpacetimeClient {
  return new SpacetimeClient();
}
