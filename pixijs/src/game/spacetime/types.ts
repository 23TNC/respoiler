import type { DbConnection } from '../../spacetime/bindings';

export type SpacetimeClient = {
  connection: DbConnection;
  disconnect: () => void;
};
