import { DbConnection } from "./bindings";
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
            notifyStateChanged();
            return;
          }

          state.observer_id = player.cardId;
          state.viewed_id = state.observer_id;
          notifyStateChanged();
        },
      });

      state.playersById = playersSubscription.state.rowsById;
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
      notifyStateChanged();
    })
    .build();

  return {
    state,
    connection,
    disconnect() {
      playersSubscription?.unsubscribe();
      connection.disconnect();
    },
  };
};
