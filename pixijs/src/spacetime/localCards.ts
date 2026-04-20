import type { Card, Zone } from "./bindings/types";

export type LocalCardKey = string;

export interface LocalCard extends Card {
  localKey: LocalCardKey;
  source: "card" | "tile";
}

const WORLD_TILE_CARD_TYPE = 6;
const ZONE_WIDTH = 8;
const ZONE_HEIGHT = 8;

const zoneRows = (zoneRow: Zone): bigint[] => [
  zoneRow.t0,
  zoneRow.t1,
  zoneRow.t2,
  zoneRow.t3,
  zoneRow.t4,
  zoneRow.t5,
  zoneRow.t6,
  zoneRow.t7,
];

export const packCardDefinition = (cardType: number, definitionId: number): number => {
  return ((cardType & 0x0f) << 12) | (definitionId & 0x0fff);
};

export const decodeCardType = (definition: number): number => {
  return (definition >> 12) & 0x0f;
};

export const packLocalPosition = (q: number, r: number): number => {
  return ((q & 0x07) << 3) | (r & 0x07);
};

export const decodeLocalPosition = (position: number): { q: number; r: number } => ({
  q: (position >> 3) & 0x07,
  r: position & 0x07,
});

export const keyForCachedCard = (cardId: number): LocalCardKey => `card:${cardId}`;

export const keyForZoneTile = (zoneId: number, position: number): LocalCardKey => `tile:${zoneId}:${position}`;

export const synthesizeZoneTileLocalCards = (zoneRow: Zone): LocalCard[] => {
  const rows = zoneRows(zoneRow);
  const localCards: LocalCard[] = [];

  for (let localR = 0; localR < ZONE_HEIGHT; localR += 1) {
    const packedRow = rows[localR] ?? 0n;

    for (let localQ = 0; localQ < ZONE_WIDTH; localQ += 1) {
      const shift = BigInt(localQ * 8);
      const definitionId = Number((packedRow >> shift) & 0xffn);
      const position = packLocalPosition(localQ, localR);

      localCards.push({
        localKey: keyForZoneTile(zoneRow.zone, position),
        source: "tile",
        cardId: 0,
        link: 0,
        flags: 0n,
        zone: zoneRow.zone,
        position,
        definition: packCardDefinition(WORLD_TILE_CARD_TYPE, definitionId),
      });
    }
  }

  return localCards;
};

export const rebuildLocalCards = (
  cachedCards: ReadonlyMap<number, Card>,
  cachedZones: ReadonlyMap<number, Zone>,
): Map<LocalCardKey, LocalCard> => {
  const rebuilt = new Map<LocalCardKey, LocalCard>();

  for (const card of cachedCards.values()) {
    const localKey = keyForCachedCard(card.cardId);
    rebuilt.set(localKey, {
      ...card,
      localKey,
      source: "card",
    });
  }

  for (const zoneRow of cachedZones.values()) {
    const zoneTiles = synthesizeZoneTileLocalCards(zoneRow);

    for (const zoneTile of zoneTiles) {
      rebuilt.set(zoneTile.localKey, zoneTile);
    }
  }

  return rebuilt;
};
