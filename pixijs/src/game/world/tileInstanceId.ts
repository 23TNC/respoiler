export type TileHostKind = 'world' | 'event';

export function worldTileInstanceId(rawTileId: bigint | number | string): string {
  return `world:${rawTileId.toString()}`;
}

export function eventTileInstanceId(
  soulId: bigint | number | string,
  rawEventTileId: bigint | number | string,
): string {
  return `event:${soulId.toString()}:${rawEventTileId.toString()}`;
}

export function isWorldTileInstanceId(tileInstanceId: string): boolean {
  return /^world:[^:]+$/.test(tileInstanceId);
}

export function isEventTileInstanceId(tileInstanceId: string): boolean {
  return /^event:[^:]+:[^:]+$/.test(tileInstanceId);
}

export function getTileHostKindFromInstanceId(tileInstanceId: string): TileHostKind | null {
  if (isWorldTileInstanceId(tileInstanceId)) {
    return 'world';
  }
  if (isEventTileInstanceId(tileInstanceId)) {
    return 'event';
  }
  return null;
}

export function getRawHostIdFromTileInstanceId(tileInstanceId: string): string | null {
  if (isWorldTileInstanceId(tileInstanceId)) {
    return tileInstanceId.slice('world:'.length);
  }
  if (isEventTileInstanceId(tileInstanceId)) {
    const [, , eventTileId] = tileInstanceId.split(':');
    return eventTileId;
  }
  return null;
}

export function getSoulIdFromEventTileInstanceId(tileInstanceId: string): string | null {
  if (!isEventTileInstanceId(tileInstanceId)) {
    return null;
  }
  const [, soulId] = tileInstanceId.split(':');
  return soulId;
}
