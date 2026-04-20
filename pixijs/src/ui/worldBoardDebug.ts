import { Container } from "pixi.js";

import { getCardDefinitionByParts } from "../spacetime/cardDefinitions";
import type { Zone } from "../spacetime/bindings/types";
import { unpackZoneCoord } from "../spacetime/zoneMath";
import { createHexCardView, isHexCardType } from "./hexCardRenderer";
import { worldHexToPanelPixel } from "./hexGrid";
import { computeHexTileSize } from "./hexLayout";
import type { PanelInnerRect } from "./panelRenderer";

export interface RenderedHexTileInfo {
  tile_id: string;
  definition: string;
  world_q: number;
  world_r: number;
}

export function drawWorldBoardDebugTiles(
  worldLayer: Container,
  worldPanelRect: PanelInnerRect,
  screenHeight: number,
  zoneRows: Zone[],
  viewedWorldQ: number,
  viewedWorldR: number,
  onHexTileRendered?: (tileView: Container, tileInfo: RenderedHexTileInfo) => void,
): void {
  const hexSize = computeHexTileSize(screenHeight);
  const worldOrigin = {
    x: worldPanelRect.x + (worldPanelRect.width / 2),
    y: worldPanelRect.y + (worldPanelRect.height / 2),
  };

  if (zoneRows.length === 0) {
    return;
  }
  for (const zoneRow of zoneRows) {
    const tiles = decodeZoneTiles(zoneRow);
    const { zoneQ, zoneR } = unpackZoneCoord(zoneRow.zone);
    console.debug("[ui] zone render triggered", { zone_id: zoneRow.zone, zone_q: zoneQ, zone_r: zoneR });

    for (let localR = 0; localR < 8; localR += 1) {
      for (let localQ = 0; localQ < 8; localQ += 1) {
        const definitionByte = tiles[localR]?.[localQ] ?? 0;
        const definition = getTileDefinition(definitionByte);
        const worldQ = zoneQ * 8 + localQ;
        const worldR = zoneR * 8 + localR;
        const pixel = worldHexToPanelPixel(
          { q: worldQ - viewedWorldQ, r: worldR - viewedWorldR },
          hexSize,
          worldOrigin,
        );

        if (!doesHexIntersectPanel(pixel.x, pixel.y, hexSize, worldPanelRect)) {
          continue;
        }

        const tileId = `zone-${zoneRow.zone}-${localQ}-${localR}`;
        const hexCard = createHexCardView(
          {
            id: tileId,
            type: 6,
            name: definition.name,
            colors: [definition.color, 0x242f4f, 0xf4f8ff],
            progress: 0,
            progressDirection: "clockwise",
            progressFillColor: 0x1a2540,
            progressEmptyColor: 0x1a2540,
          },
          {
            centerX: pixel.x,
            centerY: pixel.y,
            size: hexSize,
            screenHeight,
          },
        );

        if (!isHexCardType(TILE_CARD_TYPE)) {
          continue;
        }

        worldLayer.addChild(hexCard);
        onHexTileRendered?.(hexCard, {
          tile_id: tileId,
          definition: definition.name,
          world_q: worldQ,
          world_r: worldR,
        });
      }
    }
  }
}

const SQRT3 = Math.sqrt(3);

const doesHexIntersectPanel = (
  centerX: number,
  centerY: number,
  hexSize: number,
  panelRect: PanelInnerRect,
): boolean => {
  const halfWidth = hexSize;
  const halfHeight = (SQRT3 * hexSize) / 2;
  const hexMinX = centerX - halfWidth;
  const hexMaxX = centerX + halfWidth;
  const hexMinY = centerY - halfHeight;
  const hexMaxY = centerY + halfHeight;
  const panelMaxX = panelRect.x + panelRect.width;
  const panelMaxY = panelRect.y + panelRect.height;

  return hexMaxX >= panelRect.x
    && hexMinX <= panelMaxX
    && hexMaxY >= panelRect.y
    && hexMinY <= panelMaxY;
};

const TILE_CARD_TYPE = 6;

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

export const decodeZoneTiles = (zoneRow: Zone): number[][] => {
  const decoded: number[][] = [];
  const rows = zoneRows(zoneRow);

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const packedRow = rows[rowIndex] ?? 0n;
    const row: number[] = [];

    for (let colIndex = 0; colIndex < 8; colIndex += 1) {
      const shift = BigInt(colIndex * 8);
      const tileByte = Number((packedRow >> shift) & 0xffn);
      row.push(tileByte);
    }

    decoded.push(row);
  }

  console.debug("[ui] tile bytes decoded", { zone_id: zoneRow.zone, tiles: decoded });
  return decoded;
};

const parseHexColor = (rawColor: unknown, fallback: number): number => {
  if (typeof rawColor === "number" && Number.isFinite(rawColor)) {
    return rawColor;
  }

  if (typeof rawColor !== "string") {
    return fallback;
  }

  const normalized = rawColor.trim().replace("#", "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export const getTileDefinition = (definitionByte: number): { name: string; color: number } => {
  if (!Number.isInteger(definitionByte) || definitionByte <= 0) {
    return { name: "Unknown", color: 0x365486 };
  }

  const definition = getCardDefinitionByParts(TILE_CARD_TYPE, definitionByte);
  const color = parseHexColor(definition?.style?.color?.[0], 0x365486);
  return {
    name: definition?.name || `Tile ${definitionByte}`,
    color,
  };
};
