import { DbConnection } from '../../spacetime/bindings';
import type { SpacetimeClient } from './types';

const DEFAULT_SPACETIME_URI = 'ws://localhost:3000';
const DEFAULT_DATABASE_NAME = 'respoiler';

export async function connectSpacetimeClient(): Promise<SpacetimeClient> {
  const uri = import.meta.env.VITE_SPACETIME_URI ?? DEFAULT_SPACETIME_URI;
  const databaseName =
    import.meta.env.VITE_SPACETIME_DATABASE ?? DEFAULT_DATABASE_NAME;

  return new Promise<SpacetimeClient>((resolve, reject) => {
    let settled = false;

    const timeout = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      connection.disconnect();
      reject(new Error('Timed out while connecting to SpacetimeDB.'));
    }, 10_000);

    const connection = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(databaseName)
      .onConnect((connected) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeout);
        resolve({
          connection: connected,
          disconnect: () => connected.disconnect(),
        });
      })
      .onConnectError((_ctx, error) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      })
      .build();
  });
}
