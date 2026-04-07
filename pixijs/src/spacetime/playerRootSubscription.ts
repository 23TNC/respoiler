import { DbConnection, type SubscriptionHandle } from "./bindings";

const ROOT_PLAYER_ID = 1n;
const ROOT_PLAYER_QUERY = "select card_id from player where player_id = 1";

type RootViewIds = {
  observerId: bigint;
  viewedId: bigint;
};

type PlayerRootSubscriptionConfig = {
  connection: DbConnection;
  onIdsResolved: (ids: RootViewIds) => void;
};

export function initPlayerRootSubscription(config: PlayerRootSubscriptionConfig): () => void {
  const { connection, onIdsResolved } = config;
  let hasApplied = false;

  console.info("[ui-debug] creating player subscription", {
    query: ROOT_PLAYER_QUERY,
    expectedQuery: "select card_id from player where player_id = 1",
    connectionAttached: connection !== null,
  });

  const notAppliedTimer = window.setTimeout(() => {
    if (!hasApplied) {
      console.warn("[ui-debug] player subscription has not applied yet", {
        query: ROOT_PLAYER_QUERY,
      });
    }
  }, 3000);

  const applyCurrentPlayerCard = (reason: "initial" | "update"): void => {
    const subscribedRows = Array.from(connection.db.player.iter());
    console.info("[ui-debug] player rows snapshot", {
      reason,
      rowCount: subscribedRows.length,
      rows: subscribedRows,
    });

    const matchingPlayers = subscribedRows.filter(
      (row) => row.playerId.toString() === ROOT_PLAYER_ID.toString(),
    );

    if (matchingPlayers.length === 0) {
      console.warn("[spacetime] player card missing", {
        playerId: Number(ROOT_PLAYER_ID),
        message: "No player row exists for player_id = 1 in subscribed rows",
      });
      return;
    }

    const cardId = matchingPlayers[0].cardId;
    const observerId = cardId;
    const viewedId = cardId;

    console.info("[ui-debug] setting observer/viewed ids", {
      reason,
      cardId,
      observerId,
      viewedId,
    });
    onIdsResolved({ observerId, viewedId });

    if (reason === "initial") {
      console.info("[spacetime] player card loaded", {
        playerId: Number(ROOT_PLAYER_ID),
        cardId,
        observerId,
        viewedId,
      });
      return;
    }

    console.info("[spacetime] player card updated", {
      playerId: Number(ROOT_PLAYER_ID),
      cardId,
      observerId,
      viewedId,
    });
  };

  const handlePlayerMutation = (): void => {
    applyCurrentPlayerCard("update");
  };

  connection.db.player.onInsert(handlePlayerMutation);
  connection.db.player.onUpdate(handlePlayerMutation);
  connection.db.player.onDelete(handlePlayerMutation);

  const subscriptionBuilder = connection.subscriptionBuilder();
  console.info("[ui-debug] registering onApplied before subscribe", {
    registered: true,
  });

  const subscription: SubscriptionHandle = subscriptionBuilder
    .onApplied(() => {
      hasApplied = true;
      window.clearTimeout(notAppliedTimer);
      console.info("[ui-debug] player subscription onApplied fired", {
        query: ROOT_PLAYER_QUERY,
      });
      applyCurrentPlayerCard("initial");
    })
    .subscribe(ROOT_PLAYER_QUERY);

  console.info("[ui-debug] player subscription subscribe called", {
    query: ROOT_PLAYER_QUERY,
  });

  return () => {
    window.clearTimeout(notAppliedTimer);
    connection.db.player.removeOnInsert(handlePlayerMutation);
    connection.db.player.removeOnUpdate(handlePlayerMutation);
    connection.db.player.removeOnDelete(handlePlayerMutation);
    subscription.unsubscribe();
  };
}
