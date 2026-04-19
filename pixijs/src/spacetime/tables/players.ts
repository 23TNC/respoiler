import type { DbConnection, SubscriptionHandle } from "../bindings";
import type { Player } from "../bindings/types";
import { createTableStore, type SubscriptionCleanup, type TableStore } from "../subscriptions";

const escapeSqlString = (value: string): string => value.replaceAll("'", "\\'");

export interface PlayersSubscriptionOptions {
  name: string;
  onMatchedPlayerChanged?: (player: Player | null) => void;
}

export interface PlayersTableState {
  readonly rowsById: Map<number, Player>;
}

export interface PlayersTableSubscription extends SubscriptionCleanup {
  readonly state: PlayersTableState;
}

export const subscribeToPlayersByName = (
  connection: DbConnection,
  options: PlayersSubscriptionOptions,
): PlayersTableSubscription => {
  const store: TableStore<number, Player> = createTableStore((player) => player.playerId);
  let subscriptionHandle: SubscriptionHandle | undefined;

  const notifyMatchedPlayer = (): void => {
    if (!options.onMatchedPlayerChanged) {
      return;
    }

    const matchedPlayer = [...store.rows.values()].find((player) => player.name === options.name) ?? null;
    options.onMatchedPlayerChanged(matchedPlayer);
  };

  connection.db.players.onInsert((_ctx, row) => {
    store.upsert(row);
    notifyMatchedPlayer();
  });

  connection.db.players.onUpdate((_ctx, oldRow, row) => {
    store.remove(oldRow);
    store.upsert(row);
    notifyMatchedPlayer();
  });

  connection.db.players.onDelete((_ctx, row) => {
    store.remove(row);
    notifyMatchedPlayer();
  });

  const query = `select * from players where name == '${escapeSqlString(options.name)}'`;
  subscriptionHandle = connection.subscriptionBuilder().subscribe(query);

  return {
    state: {
      rowsById: store.rows,
    },
    unsubscribe() {
      store.clear();
      subscriptionHandle?.unsubscribe();
      notifyMatchedPlayer();
    },
  };
};
