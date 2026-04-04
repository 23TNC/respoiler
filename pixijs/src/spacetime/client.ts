import { DbConnection, type SubscriptionHandle } from './bindings';

export interface SpacetimeRowsSnapshot {
  souls: ReturnType<DbConnection['db']['soul']['iter']> extends Iterable<infer T> ? T[] : never[];
  cards: ReturnType<DbConnection['db']['card']['iter']> extends Iterable<infer T> ? T[] : never[];
  worldTiles: ReturnType<DbConnection['db']['world_tile']['iter']> extends Iterable<infer T> ? T[] : never[];
  eventTiles: ReturnType<DbConnection['db']['event_tile']['iter']> extends Iterable<infer T> ? T[] : never[];
  attachments: ReturnType<DbConnection['db']['tile_technique_attachment']['iter']> extends Iterable<infer T> ? T[] : never[];
  stageEntries: ReturnType<DbConnection['db']['tile_stage_entry']['iter']> extends Iterable<infer T> ? T[] : never[];
}

export interface SpacetimeClientConfig {
  uri: string;
  databaseName: string;
  token?: string;
}

const SUBSCRIPTION_SQL = [
  'SELECT * FROM soul',
  'SELECT * FROM card',
  'SELECT * FROM world_tile',
  'SELECT * FROM event_tile',
  'SELECT * FROM tile_technique_attachment',
  'SELECT * FROM tile_stage_entry',
];

export class SpacetimeClient {
  private connection: DbConnection | null = null;

  private subscriptionHandle: SubscriptionHandle | null = null;

  private listeners = new Set<(rows: SpacetimeRowsSnapshot) => void>();

  private seedRequested = false;

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

    this.subscriptionHandle = this.connection
      .subscriptionBuilder()
      .onApplied(() => {
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
  }

  async seedTestData(): Promise<void> {
    if (!this.connection || this.seedRequested) {
      return;
    }
    this.seedRequested = true;
    try {
      await this.connection.reducers.seedTestData({});
    } finally {
      this.seedRequested = false;
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

  async stageCardOnHost(soulId: bigint, hostType: 'WorldTile' | 'EventTile', hostId: bigint, cardId: bigint): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.reducers.stageCardOnHost({ soulId, hostType: { tag: hostType }, hostId, cardId });
  }

  private bindRowListeners(): void {
    const db = this.connection?.db;
    if (!db) {
      return;
    }

    const wire = <T>(table: {
      onInsert: (cb: (ctx: unknown, row: T) => void) => void;
      onDelete: (cb: (ctx: unknown, row: T) => void) => void;
      onUpdate?: (cb: (ctx: unknown, oldRow: T, newRow: T) => void) => void;
    }): void => {
      table.onInsert(() => this.notify());
      table.onDelete(() => this.notify());
      table.onUpdate?.(() => this.notify());
    };

    wire(db.soul);
    wire(db.card);
    wire(db.world_tile);
    wire(db.event_tile);
    wire(db.tile_technique_attachment);
    wire(db.tile_stage_entry);
  }

  private snapshotRows(): SpacetimeRowsSnapshot {
    if (!this.connection) {
      return {
        souls: [],
        cards: [],
        worldTiles: [],
        eventTiles: [],
        attachments: [],
        stageEntries: [],
      };
    }

    return {
      souls: Array.from(this.connection.db.soul.iter()),
      cards: Array.from(this.connection.db.card.iter()),
      worldTiles: Array.from(this.connection.db.world_tile.iter()),
      eventTiles: Array.from(this.connection.db.event_tile.iter()),
      attachments: Array.from(this.connection.db.tile_technique_attachment.iter()),
      stageEntries: Array.from(this.connection.db.tile_stage_entry.iter()),
    };
  }

  private notify(): void {
    const rows = this.snapshotRows();
    this.listeners.forEach((listener) => listener(rows));
  }
}

export function createSpacetimeClient(): SpacetimeClient {
  return new SpacetimeClient();
}
