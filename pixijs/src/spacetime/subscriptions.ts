export interface TableStore<Key, Row> {
  readonly rows: Map<Key, Row>;
  applyInitial(rows: Iterable<Row>): void;
  upsert(row: Row): void;
  remove(row: Row): void;
  clear(): void;
}

export const createTableStore = <Key, Row>(getKey: (row: Row) => Key): TableStore<Key, Row> => {
  const rows = new Map<Key, Row>();

  return {
    rows,
    applyInitial(initialRows) {
      rows.clear();

      for (const row of initialRows) {
        rows.set(getKey(row), row);
      }
    },
    upsert(row) {
      rows.set(getKey(row), row);
    },
    remove(row) {
      rows.delete(getKey(row));
    },
    clear() {
      rows.clear();
    },
  };
};

export interface SubscriptionCleanup {
  unsubscribe(): void;
}
