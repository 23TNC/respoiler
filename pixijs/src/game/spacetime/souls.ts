import type { Soul } from '../../spacetime/bindings/types';
import type { SpacetimeClient } from './types';

export type SoulResolution =
  | { status: 'none' }
  | { status: 'single'; soulId: number }
  | { status: 'multiple'; soulIds: number[] };

export function resolveSoulsForPlayer(
  client: SpacetimeClient,
  playerId: number,
): SoulResolution {
  const rows = Array.from(client.connection.db.soul.iter());
  const matchingSouls = rows.filter((row) => isRowOwnedByPlayer(row, playerId));

  if (matchingSouls.length === 0) {
    return { status: 'none' };
  }

  const soulIds = matchingSouls.map((row) => Number(row.soulId));

  if (soulIds.length === 1) {
    return { status: 'single', soulId: soulIds[0] };
  }

  return { status: 'multiple', soulIds };
}

function isRowOwnedByPlayer(row: Soul, playerId: number): boolean {
  const rowPlayerId = optionToBigInt(row.playerId);
  return rowPlayerId !== null && rowPlayerId === BigInt(playerId);
}

function optionToBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }

  if (value == null) {
    return null;
  }

  if (typeof value === 'object' && 'tag' in value && 'value' in value) {
    const tagged = value as { tag: string; value: unknown };

    if (tagged.tag.toLowerCase() === 'none') {
      return null;
    }

    return optionToBigInt(tagged.value);
  }

  if (Array.isArray(value)) {
    const [first] = value;
    return optionToBigInt(first);
  }

  if (typeof value === 'number') {
    return BigInt(value);
  }

  return null;
}
