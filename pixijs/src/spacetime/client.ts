import { DbConnection, type SubscriptionHandle } from "./bindings";
import type { Player, Zone } from "./bindings/types";
import { createSpacetimeState, type SpacetimeState } from "./state/spacetimeState";
import { subscribeToPlayersByName, type PlayersTableSubscription } from "./tables/players";
import { packZoneCoord, signExtendI12, worldToZone } from "./zoneMath";

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
  const zoneSubscriptions = new Map<number, SubscriptionHandle>();

  const getRequiredZones = (zoneQ: number, zoneR: number, z: number, localQ: number, localR: number): number[] => {
    const horizontalOffset = localQ < 4 ? -1 : localQ > 4 ? 1 : 0;
    const verticalOffset = localR < 4 ? -1 : localR > 4 ? 1 : 0;
    const zoneIds = new Set<number>();
    const pushZone = (q: number, r: number): void => {
      zoneIds.add(packZoneCoord(q, r, z));
    };

    pushZone(zoneQ, zoneR);

    if (horizontalOffset !== 0) {
      pushZone(zoneQ + horizontalOffset, zoneR);
    }

    if (verticalOffset !== 0) {
      pushZone(zoneQ, zoneR + verticalOffset);
    }

    if (horizontalOffset !== 0 && verticalOffset !== 0) {
      pushZone(zoneQ + horizontalOffset, zoneR + verticalOffset);
    }

    return [...zoneIds];
  };

  const syncZoneSubscriptions = (requiredZoneIds: number[]): void => {
    const required = new Set(requiredZoneIds);

    required.forEach((zoneId) => {
      ensureCachedRowSubscription<Zone>(
        zoneId,
        zoneSubscriptions,
        state.cached_zone,
        (id) => `select * from zones where zone == ${id}`,
      );
    });

    for (const [zoneId, handle] of zoneSubscriptions.entries()) {
      if (!required.has(zoneId)) {
        handle.unsubscribe();
        zoneSubscriptions.delete(zoneId);
      }
    }
  };

  const clearZoneSubscriptions = (): void => {
    zoneSubscriptions.forEach((handle) => {
      handle.unsubscribe();
    });
    zoneSubscriptions.clear();
  };

  const decodePlayerWorldPosition = (
    playerRow: Player,
  ): { zoneQ: number; zoneR: number; localQ: number; localR: number; world_q: number; world_r: number; z: number } => {
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

    return { zoneQ, zoneR, localQ, localR, world_q, world_r, z };
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
    const zone = worldToZone(decoded.world_q, decoded.world_r, decoded.z);
    state.current_zone_id = zone.zoneId;
    console.debug("[spacetime] world position to zone conversion", {
      world_q: decoded.world_q,
      world_r: decoded.world_r,
      z: decoded.z,
      zone_q: zone.zoneQ,
      zone_r: zone.zoneR,
    });
    console.debug("[spacetime] packed zone id", { zone_id: zone.zoneId });
    syncZoneSubscriptions(getRequiredZones(zone.zoneQ, zone.zoneR, decoded.z, decoded.localQ, decoded.localR));
  };

  const ensureCachedRowSubscription = <Row>(
    key: number,
    subscriptions: Map<number, SubscriptionHandle>,
    rowCache: Map<number, Row>,
    queryBuilder: (id: number) => string,
  ): void => {
    if (subscriptions.has(key)) {
      console.debug("[spacetime] subscription cache hit", { key });
      return;
    }

    console.debug("[spacetime] subscription cache miss", { key, cached_rows: rowCache.size });
    const query = queryBuilder(key);
    const subscriptionHandle = connection.subscriptionBuilder().subscribe(query);
    subscriptions.set(key, subscriptionHandle);
    console.debug("[spacetime] subscription created", { key, query });
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
            state.current_zone_id = 0;
            clearZoneSubscriptions();
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
          state.current_zone_id = 0;
          clearZoneSubscriptions();
          notifyStateChanged();
        }
      });

      connection.db.zones.onInsert((_ctx, row) => {
        state.cached_zone.set(row.zone, row);
        console.debug("[spacetime] zone row received", { zone_id: row.zone, event: "insert" });
        if (row.zone === state.current_zone_id) {
          notifyStateChanged();
        }
      });

      connection.db.zones.onUpdate((_ctx, oldRow, row) => {
        state.cached_zone.delete(oldRow.zone);
        state.cached_zone.set(row.zone, row);
        console.debug("[spacetime] zone row updated", { zone_id: row.zone, event: "update" });
        if (row.zone === state.current_zone_id || oldRow.zone === state.current_zone_id) {
          notifyStateChanged();
        }
      });

      connection.db.zones.onDelete((_ctx, row) => {
        state.cached_zone.delete(row.zone);
        console.debug("[spacetime] zone row removed", { zone_id: row.zone, event: "delete" });
        if (row.zone === state.current_zone_id) {
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
      state.current_zone_id = 0;
      state.cached_player.clear();
      state.cached_zone.clear();
      viewedPlayerSubscriptions.forEach((handle) => {
        handle.unsubscribe();
      });
      viewedPlayerSubscriptions.clear();
      clearZoneSubscriptions();
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
      clearZoneSubscriptions();
      connection.disconnect();
    },
  };
};
