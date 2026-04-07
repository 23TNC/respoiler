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

  const applyCurrentPlayerCard = (reason: "initial" | "update"): void => {
    const matchingPlayers = Array.from(connection.db.player.iter()).filter(
      (row) => row.playerId === ROOT_PLAYER_ID,
    );

    if (matchingPlayers.length === 0) {
      console.warn("[spacetime] player card missing", { playerId: Number(ROOT_PLAYER_ID) });
      return;
    }

    const cardId = matchingPlayers[0].cardId;
    const observerId = cardId;
    const viewedId = cardId;

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

  const subscription: SubscriptionHandle = connection
    .subscriptionBuilder()
    .onApplied(() => {
      applyCurrentPlayerCard("initial");
    })
    .subscribe(ROOT_PLAYER_QUERY);

  return () => {
    connection.db.player.removeOnInsert(handlePlayerMutation);
    connection.db.player.removeOnUpdate(handlePlayerMutation);
    connection.db.player.removeOnDelete(handlePlayerMutation);
    subscription.unsubscribe();
  };
}
