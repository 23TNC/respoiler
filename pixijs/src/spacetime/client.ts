import { DbConnection, type ErrorContext } from "./bindings";

const DEFAULT_SPACETIMEDB_URI = "ws://localhost:3000";
const DEFAULT_DATABASE_NAME = "respoiler";

let connection: DbConnection | null = null;

export function initSpacetimeClient(): DbConnection | null {
  if (connection) {
    console.info("[ui-debug] reusing existing DbConnection instance", {
      hasConnection: true,
    });
    return connection;
  }

  const uri = import.meta.env.VITE_SPACETIMEDB_URI ?? DEFAULT_SPACETIMEDB_URI;
  const databaseName =
    import.meta.env.VITE_SPACETIMEDB_DATABASE ?? DEFAULT_DATABASE_NAME;

  try {
    console.info("[ui-debug] creating DbConnection", {
      uri,
      databaseName,
    });
    connection = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(databaseName)
      .onConnect(() => {
        console.info("[spacetime] connected");
        console.info("[ui-debug] DbConnection onConnect fired");
      })
      .onConnectError((_ctx: ErrorContext, error: Error) => {
        console.error("[spacetime] connection failed");
        console.error("[spacetime] error", error);
      })
      .build();
  } catch (error) {
    console.error("[spacetime] connection failed");
    console.error("[spacetime] error", error);
    connection = null;
  }

  return connection;
}

export function getSpacetimeConnection(): DbConnection | null {
  return connection;
}
