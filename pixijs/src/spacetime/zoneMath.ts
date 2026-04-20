const ZONE_SIZE = 8;

export const signExtendI12 = (value: number): number => {
  const masked = value & 0x0fff;
  return (masked & 0x0800) !== 0 ? masked | ~0x0fff : masked;
};

export const packZoneCoord = (zoneQ: number, zoneR: number, z: number): number => {
  return (((zoneQ & 0x0fff) << 20) | ((zoneR & 0x0fff) << 8) | (z & 0xff)) >>> 0;
};

export const unpackZoneCoord = (zone: number): { zoneQ: number; zoneR: number; z: number } => {
  return {
    zoneQ: signExtendI12((zone >>> 20) & 0x0fff),
    zoneR: signExtendI12((zone >>> 8) & 0x0fff),
    z: zone & 0xff,
  };
};

export const unpackTilePosition = (position: number): { q: number; r: number } => {
  return {
    q: (position >> 3) & 0x07,
    r: position & 0x07,
  };
};

export const packedZoneAndPositionToWorld = (
  zone: number,
  position: number,
): { worldQ: number; worldR: number; z: number } => {
  const { zoneQ, zoneR, z } = unpackZoneCoord(zone);
  const { q, r } = unpackTilePosition(position);

  return {
    worldQ: (zoneQ * ZONE_SIZE) + q,
    worldR: (zoneR * ZONE_SIZE) + r,
    z,
  };
};

export const worldToZone = (
  worldQ: number,
  worldR: number,
  z: number,
): { zoneQ: number; zoneR: number; zoneId: number } => {
  const zoneQ = Math.floor(worldQ / ZONE_SIZE);
  const zoneR = Math.floor(worldR / ZONE_SIZE);
  return {
    zoneQ,
    zoneR,
    zoneId: packZoneCoord(zoneQ, zoneR, z),
  };
};
