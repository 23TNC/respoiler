import { DbConnection, type SubscriptionHandle } from "./bindings";
import type { Player } from "./bindings/types";
import { createSpacetimeState, type SpacetimeState } from "./state/spacetimeState";
import { subscribeToPlayersByName, type PlayersTableSubscription } from "./tables/players";

export interface SpacetimeClientOptions {
  uri: string;
  databaseName: string;
  observedPlayerName: string;
  onStateChanged?: (state: Readonly<SpacetimeState>) => void;
}

export interface SpacetimeClient {
  readonly state: SpacetimeState;
  readonly connection: DbConnection;
  disconnect(): void;
}

export const initializeSpacetimeClient = (options: SpacetimeClientOptions): SpacetimeClient => {
  const state = createSpacetimeState();
  let playersSubscription: PlayersTableSubscription | undefined;
  const viewedPlayerSubscriptions = new Map<number, SubscriptionHandle>();

  const signExtendI12 = (value: number): number => {
    const masked = value & 0x0fff;
    return (masked & 0x0800) !== 0 ? masked | ~0x0fff : masked;
  };

  const decodePlayerWorldPosition = (playerRow: Player): { world_q: number; world_r: number; z: number } => {
    // Server layout from packing.rs:
    // zone bits [20..31] = zone_q (i12), [8..19] = zone_r (i12), [0..7] = z (u8)
    // position bits [3..5] = q (u3), [0..2] = r (u3)
    const zoneQ = signExtendI12((playerRow.zone >>> 20) & 0x0fff);
    const zoneR = signExtendI12((playerRow.zone >>> 8) & 0x0fff);
    const z = playerRow.zone & 0xff;
    const localQ = (playerRow.position >>> 3) & 0x07;
    const localR = playerRow.position & 0x07;

    const world_q = zoneQ * 8 + localQ;
    const world_r = zoneR * 8 + localR;

    console.debug("[spacetime] viewed player decoded", {
      zone_q: zoneQ,
      zone_r: zoneR,
      local_q: localQ,
      local_r: localR,
      z,
    });
    console.debug("[spacetime] viewed player world", { world_q, world_r, z });

    return { world_q, world_r, z };
  };

  const updateViewedWorldPosition = (): void => {
    if (state.viewed_id === 0) {
      return;
    }

    const viewedPlayer = state.cached_player.get(state.viewed_id);

    if (!viewedPlayer) {
      return;
    }

    const decoded = decodePlayerWorldPosition(viewedPlayer);
    state.world_q = decoded.world_q;
    state.world_r = decoded.world_r;
    state.view_z = decoded.z;
  };

  const ensureViewedPlayerSubscription = (viewedId: number): void => {
    if (viewedId === 0) {
      return;
    }

    const cached = state.cached_player.get(viewedId);

    if (cached) {
      console.debug("[spacetime] viewed player cache hit", { viewed_id: viewedId });
      updateViewedWorldPosition();
      notifyStateChanged();
      return;
    }

    console.debug("[spacetime] viewed player cache miss", { viewed_id: viewedId });

    if (viewedPlayerSubscriptions.has(viewedId)) {
      return;
    }

    const query = `select * from players where card_id == ${viewedId}`;
    const subscriptionHandle = connection.subscriptionBuilder().subscribe(query);
    viewedPlayerSubscriptions.set(viewedId, subscriptionHandle);
    console.debug("[spacetime] viewed player subscription created", { viewed_id: viewedId, query });
  };

  const notifyStateChanged = (): void => {
    options.onStateChanged?.(state);
  };

  const connection = DbConnection.builder()
    .withUri(options.uri)
    .withDatabaseName(options.databaseName)
    .onConnect((dbConnection) => {
      console.debug("[spacetime] subscription created", {
        query: `select * from players where name == '${options.observedPlayerName}'`,
      });

      playersSubscription = subscribeToPlayersByName(dbConnection, {
        name: options.observedPlayerName,
        onMatchedPlayerChanged: (player) => {
          if (!player) {
            state.observer_id = 0;
            state.viewed_id = 0;
            state.world_q = 0;
            state.world_r = 0;
            state.view_z = 0;
            notifyStateChanged();
            return;
          }

          state.observer_id = player.cardId;
          if (state.viewed_id === 0) {
            state.viewed_id = state.observer_id;
            console.debug("[spacetime] viewed_id assigned", { viewed_id: state.viewed_id });
          }
          ensureViewedPlayerSubscription(state.viewed_id);
          updateViewedWorldPosition();
          notifyStateChanged();
        },
      });

      connection.db.players.onInsert((_ctx, row) => {
        state.cached_player.set(row.cardId, row);

        if (row.cardId === state.viewed_id) {
          console.debug("[spacetime] viewed player row received", { viewed_id: state.viewed_id, event: "insert" });
          updateViewedWorldPosition();
          notifyStateChanged();
        }
      });

      connection.db.players.onUpdate((_ctx, oldRow, row) => {
        state.cached_player.delete(oldRow.cardId);
        state.cached_player.set(row.cardId, row);

        if (row.cardId === state.viewed_id || oldRow.cardId === state.viewed_id) {
          console.debug("[spacetime] viewed player row received", { viewed_id: state.viewed_id, event: "update" });
          updateViewedWorldPosition();
          notifyStateChanged();
        }
      });

      connection.db.players.onDelete((_ctx, row) => {
        state.cached_player.delete(row.cardId);

        if (row.cardId === state.viewed_id) {
          state.world_q = 0;
          state.world_r = 0;
          state.view_z = 0;
          notifyStateChanged();
        }
      });

      notifyStateChanged();
    })
    .onConnectError((_ctx, error) => {
      console.error("[spacetime] connection error", error);
    })
    .onDisconnect((error) => {
      console.warn("[spacetime] disconnected", error);
      playersSubscription?.unsubscribe();
      state.observer_id = 0;
      state.viewed_id = 0;
      state.world_q = 0;
      state.world_r = 0;
      state.view_z = 0;
      state.cached_player.clear();
      viewedPlayerSubscriptions.forEach((handle) => {
        handle.unsubscribe();
      });
      viewedPlayerSubscriptions.clear();
      notifyStateChanged();
    })
    .build();

  return {
    state,
    connection,
    disconnect() {
      playersSubscription?.unsubscribe();
      viewedPlayerSubscriptions.forEach((handle) => {
        handle.unsubscribe();
      });
      viewedPlayerSubscriptions.clear();
      connection.disconnect();
    },
  };
};
