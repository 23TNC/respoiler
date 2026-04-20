import { DbConnection, type SubscriptionHandle } from "./bindings";
import type { Player, Zone } from "./bindings/types";
import { buildInventoryCards } from "./inventory";
import { rebuildLocalCards } from "./localCards";
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
  let cardsSubscription: SubscriptionHandle | undefined;
  let actionsSubscription: SubscriptionHandle | undefined;
  const viewedPlayerSubscriptions = new Map<number, SubscriptionHandle>();
  const zoneSubscriptions = new Map<number, SubscriptionHandle>();

  const notifyStateChanged = (): void => {
    options.onStateChanged?.(state);
  };

  const rebuildLocalCardsFromCaches = (): void => {
    state.local_cards = rebuildLocalCards(state.cached_cards, state.cached_zones);
    state.inventory_cards = buildInventoryCards(state.local_cards.values(), state.viewed_id);
  };

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

  const syncZoneSubscriptions = (requiredZoneIds: number[]): void => {
    const required = new Set(requiredZoneIds);

    required.forEach((zoneId) => {
      ensureCachedRowSubscription<Zone>(
        zoneId,
        zoneSubscriptions,
        state.cached_zones,
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

  const clearCardCaches = (): void => {
    state.cached_cards.clear();
    state.cached_actions.clear();
    rebuildLocalCardsFromCaches();
  };

  const areZoneSetsEqual = (left: number[], right: number[]): boolean => {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }

    return true;
  };

  const decodePlayerWorldPosition = (
    playerRow: Player,
  ): { zoneQ: number; zoneR: number; localQ: number; localR: number; world_q: number; world_r: number; z: number } => {
    const zoneQ = signExtendI12((playerRow.zone >>> 20) & 0x0fff);
    const zoneR = signExtendI12((playerRow.zone >>> 8) & 0x0fff);
    const z = playerRow.zone & 0xff;
    const localQ = (playerRow.position >>> 3) & 0x07;
    const localR = playerRow.position & 0x07;

    const world_q = zoneQ * 8 + localQ;
    const world_r = zoneR * 8 + localR;

    return { zoneQ, zoneR, localQ, localR, world_q, world_r, z };
  };

  const updateViewedWorldPosition = (): void => {
    if (state.viewed_id === 0) {
      return;
    }

    const viewedPlayer = state.cached_players.get(state.viewed_id);

    if (!viewedPlayer) {
      return;
    }

    const decoded = decodePlayerWorldPosition(viewedPlayer);
    state.world_q = decoded.world_q;
    state.world_r = decoded.world_r;
    state.view_z = decoded.z;
    const zone = worldToZone(decoded.world_q, decoded.world_r, decoded.z);
    state.current_zone_id = zone.zoneId;
    const requiredZoneIds = getRequiredZones(zone.zoneQ, zone.zoneR, decoded.z, decoded.localQ, decoded.localR);
    const visibleZonesChanged = !areZoneSetsEqual(state.visible_zone_ids, requiredZoneIds);
    state.visible_zone_ids = requiredZoneIds;
    syncZoneSubscriptions(requiredZoneIds);

    if (visibleZonesChanged) {
      rebuildLocalCardsFromCaches();
      notifyStateChanged();
    }
  };

  const ensureViewedPlayerSubscription = (viewedId: number): void => {
    if (viewedId === 0) {
      return;
    }

    const cached = state.cached_players.get(viewedId);

    if (cached) {
      updateViewedWorldPosition();
      notifyStateChanged();
      return;
    }

    if (viewedPlayerSubscriptions.has(viewedId)) {
      return;
    }

    const query = `select * from players where card_id == ${viewedId}`;
    const subscriptionHandle = connection.subscriptionBuilder().subscribe(query);
    viewedPlayerSubscriptions.set(viewedId, subscriptionHandle);
    console.debug("[spacetime] viewed player subscription created", { viewed_id: viewedId, query });
  };

  const resetViewState = (): void => {
    state.observer_id = 0;
    state.viewed_id = 0;
    state.world_q = 0;
    state.world_r = 0;
    state.view_z = 0;
    state.current_zone_id = 0;
    state.visible_zone_ids = [];
  };

  const connection = DbConnection.builder()
    .withUri(options.uri)
    .withDatabaseName(options.databaseName)
    .onConnect((dbConnection) => {
      playersSubscription = subscribeToPlayersByName(dbConnection, {
        name: options.observedPlayerName,
        onMatchedPlayerChanged: (player) => {
          if (!player) {
            resetViewState();
            clearZoneSubscriptions();
            clearCardCaches();
            notifyStateChanged();
            return;
          }

          state.observer_id = player.cardId;
          if (state.viewed_id === 0) {
            state.viewed_id = state.observer_id;
          }
          ensureViewedPlayerSubscription(state.viewed_id);
          updateViewedWorldPosition();
          rebuildLocalCardsFromCaches();
          notifyStateChanged();
        },
      });

      cardsSubscription = connection.subscriptionBuilder().subscribe("select * from cards");
      actionsSubscription = connection.subscriptionBuilder().subscribe("select * from actions");

      connection.db.players.onInsert((_ctx, row) => {
        state.cached_players.set(row.cardId, row);

        if (row.cardId === state.viewed_id) {
          updateViewedWorldPosition();
        }

        notifyStateChanged();
      });

      connection.db.players.onUpdate((_ctx, oldRow, row) => {
        state.cached_players.delete(oldRow.cardId);
        state.cached_players.set(row.cardId, row);

        if (row.cardId === state.viewed_id || oldRow.cardId === state.viewed_id) {
          updateViewedWorldPosition();
        }

        notifyStateChanged();
      });

      connection.db.players.onDelete((_ctx, row) => {
        state.cached_players.delete(row.cardId);

        if (row.cardId === state.viewed_id) {
          resetViewState();
          clearZoneSubscriptions();
          clearCardCaches();
        }

        notifyStateChanged();
      });

      connection.db.cards.onInsert((_ctx, row) => {
        state.cached_cards.set(row.cardId, row);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.cards.onUpdate((_ctx, oldRow, row) => {
        state.cached_cards.delete(oldRow.cardId);
        state.cached_cards.set(row.cardId, row);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.cards.onDelete((_ctx, row) => {
        state.cached_cards.delete(row.cardId);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.zones.onInsert((_ctx, row) => {
        state.cached_zones.set(row.zone, row);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.zones.onUpdate((_ctx, oldRow, row) => {
        state.cached_zones.delete(oldRow.zone);
        state.cached_zones.set(row.zone, row);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.zones.onDelete((_ctx, row) => {
        state.cached_zones.delete(row.zone);
        rebuildLocalCardsFromCaches();
        notifyStateChanged();
      });

      connection.db.actions.onInsert((_ctx, row) => {
        state.cached_actions.set(row.cardId, row);
        notifyStateChanged();
      });

      connection.db.actions.onUpdate((_ctx, oldRow, row) => {
        state.cached_actions.delete(oldRow.cardId);
        state.cached_actions.set(row.cardId, row);
        notifyStateChanged();
      });

      connection.db.actions.onDelete((_ctx, row) => {
        state.cached_actions.delete(row.cardId);
        notifyStateChanged();
      });

      rebuildLocalCardsFromCaches();
      notifyStateChanged();
    })
    .onConnectError((_ctx, error) => {
      console.error("[spacetime] connection error", error);
    })
    .onDisconnect((error) => {
      console.warn("[spacetime] disconnected", error);
      playersSubscription?.unsubscribe();
      cardsSubscription?.unsubscribe();
      actionsSubscription?.unsubscribe();
      resetViewState();
      state.cached_players.clear();
      state.cached_zones.clear();
      clearCardCaches();
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
      cardsSubscription?.unsubscribe();
      actionsSubscription?.unsubscribe();
      viewedPlayerSubscriptions.forEach((handle) => {
        handle.unsubscribe();
      });
      viewedPlayerSubscriptions.clear();
      clearZoneSubscriptions();
      connection.disconnect();
    },
  };
};
