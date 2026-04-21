import { type Container } from "pixi.js";

import {
  client_cards,
  client_cards_by_zone,
  getCardDefinition,
  packDefinition,
  packZone,
  server_zones,
  type ClientCard,
  type ServerZone,
} from "../../spacetime/data";
import { createHexCardView } from "../hexagon/card_renderer";
import { worldHexToPanelPixel } from "../hexagon/grid";
import { computeHexTileSize } from "../hexagon/layout";
import type { HitEntity } from "../input/types";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

interface DisplayWorldTile {
  card_type: 6;
  definition: number;
  definition_id: number;
  world_q: number;
  world_r: number;
  z: number;
  id: string;
}

interface CachedHexTile {
  container: Container;
  definition: number;
}

export class WorldBoardPanel extends Panel {
  private viewport_q = 0;
  private viewport_r = 0;
  private readonly z = 1;
  private hexSize = 0;

  private readonly tileCache = new Map<string, CachedHexTile>();
  private cachedHexSize = 0;
  private cachedScreenHeight = 0;
  private cachedInnerRectX = 0;
  private cachedInnerRectY = 0;
  private cachedInnerRectWidth = 0;
  private cachedInnerRectHeight = 0;

  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  override refresh(_screenWidth: number, screenHeight: number): void {
    const innerRect = this.getInnerRect();
    const hexSize = computeHexTileSize(screenHeight);
    this.hexSize = hexSize;

    const geometryChanged = (
      hexSize !== this.cachedHexSize ||
      screenHeight !== this.cachedScreenHeight ||
      innerRect.x !== this.cachedInnerRectX ||
      innerRect.y !== this.cachedInnerRectY ||
      innerRect.width !== this.cachedInnerRectWidth ||
      innerRect.height !== this.cachedInnerRectHeight
    );

    if (geometryChanged) {
      this.purgeTileCache();
      this.cachedHexSize = hexSize;
      this.cachedScreenHeight = screenHeight;
      this.cachedInnerRectX = innerRect.x;
      this.cachedInnerRectY = innerRect.y;
      this.cachedInnerRectWidth = innerRect.width;
      this.cachedInnerRectHeight = innerRect.height;
    }

    const worldOrigin = {
      x: innerRect.x + (innerRect.width / 2),
      y: innerRect.y + (innerRect.height / 2),
    };

    // Compute which zones are visible based on actual panel dimensions.
    // hexSize * 1.5 = horizontal distance between hex centers (q axis).
    // hexSize * sqrt(3) = vertical distance between hex centers (r axis).
    // Add halfTilesQ/2 extra to r range to account for the axial skew term.
    const halfTilesQ = Math.ceil((innerRect.width / 2) / (hexSize * 1.5)) + 1;
    const halfTilesR = Math.ceil((innerRect.height / 2) / (hexSize * Math.sqrt(3))) + Math.ceil(halfTilesQ / 2) + 1;

    const minZoneQ = Math.floor((this.viewport_q - halfTilesQ) / 8);
    const maxZoneQ = Math.floor((this.viewport_q + halfTilesQ) / 8);
    const minZoneR = Math.floor((this.viewport_r - halfTilesR) / 8);
    const maxZoneR = Math.floor((this.viewport_r + halfTilesR) / 8);

    const needed = new Map<string, { tile: DisplayWorldTile; pixel: { x: number; y: number } }>();
    for (let zq = minZoneQ; zq <= maxZoneQ; zq += 1) {
      for (let zr = minZoneR; zr <= maxZoneR; zr += 1) {
        this.collectZoneTiles(zq, zr, hexSize, worldOrigin, innerRect, needed);
      }
    }

    for (const [key, { tile, pixel }] of needed) {
      const cached = this.tileCache.get(key);
      if (cached && cached.definition === tile.definition) {
        cached.container.x = pixel.x;
        cached.container.y = pixel.y;
      } else {
        if (cached) {
          this.content.removeChild(cached.container);
          cached.container.destroy({ children: true });
        }
        const container = this.createTileContainer(tile, hexSize, screenHeight);
        container.x = pixel.x;
        container.y = pixel.y;
        this.content.addChild(container);
        this.tileCache.set(key, { container, definition: tile.definition });
      }
    }

    const staleKeys: string[] = [];
    for (const key of this.tileCache.keys()) {
      if (!needed.has(key)) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      const cached = this.tileCache.get(key)!;
      this.content.removeChild(cached.container);
      cached.container.destroy({ children: true });
      this.tileCache.delete(key);
    }
  }

  getViewportPosition(): { q: number; r: number } {
    return { q: this.viewport_q, r: this.viewport_r };
  }

  setViewportPosition(q: number, r: number): void {
    this.viewport_q = q;
    this.viewport_r = r;
  }

  screenDeltaToWorldDelta(dx: number, dy: number): { q: number; r: number } {
    if (this.hexSize <= 0) {
      return { q: 0, r: 0 };
    }

    const q = dx / (this.hexSize * (3 / 2));
    const r = (dy / (this.hexSize * Math.sqrt(3))) - (q / 2);

    return { q, r };
  }

  private purgeTileCache(): void {
    this.clearContent();
    this.tileCache.clear();
  }

  private collectZoneTiles(
    zone_q: number,
    zone_r: number,
    hexSize: number,
    worldOrigin: { x: number; y: number },
    innerRect: LayoutRect,
    needed: Map<string, { tile: DisplayWorldTile; pixel: { x: number; y: number } }>,
  ): void {
    const zone = packZone(zone_q, zone_r, this.z);
    // Flat-top hex (vertices at 0°,60°,120°…): half-width = size, half-height = size * sqrt(3)/2
    const hexHalfW = hexSize;
    const hexHalfH = hexSize * Math.sqrt(3) / 2;

    for (let local_q = 0; local_q < 8; local_q += 1) {
      for (let local_r = 0; local_r < 8; local_r += 1) {
        const world_q = zone_q * 8 + local_q;
        const world_r = zone_r * 8 + local_r;
        const tile = this.resolveDisplayedWorldTile(zone, world_q, world_r, local_q, local_r, this.z);
        if (!tile) {
          continue;
        }

        const pixel = worldHexToPanelPixel(
          { q: tile.world_q - this.viewport_q, r: tile.world_r - this.viewport_r },
          hexSize,
          worldOrigin,
        );

        // Skip tiles whose bounding box is entirely outside the panel.
        if (
          pixel.x + hexHalfW < innerRect.x ||
          pixel.x - hexHalfW > innerRect.x + innerRect.width ||
          pixel.y + hexHalfH < innerRect.y ||
          pixel.y - hexHalfH > innerRect.y + innerRect.height
        ) {
          continue;
        }

        const key = `${world_q}:${world_r}:${this.z}`;
        needed.set(key, { tile, pixel });
      }
    }
  }

  private createTileContainer(tile: DisplayWorldTile, hexSize: number, screenHeight: number): Container {
    return createHexCardView(
      {
        id: tile.id,
        type: 6,
        name: getCardDefinition(tile.definition)?.name ?? `#${tile.definition_id}`,
        colors: [
          resolveStyleColor(getCardDefinition(tile.definition), 0, 0xd3deef),
          resolveStyleColor(getCardDefinition(tile.definition), 1, 0x7fb377),
          resolveStyleColor(getCardDefinition(tile.definition), 2, 0x0b1a2a),
        ],
        progress: 0,
        progressDirection: "clockwise",
        progressFillColor: 0x8da6c6,
        progressEmptyColor: 0x32475f,
      },
      {
        centerX: 0,
        centerY: 0,
        size: hexSize,
        screenHeight,
      },
    );
  }

  private resolveDisplayedWorldTile(
    zone: number,
    world_q: number,
    world_r: number,
    local_q: number,
    local_r: number,
    z: number,
  ): DisplayWorldTile | null {
    const clientTile = this.resolveClientWorldTile(zone, world_q, world_r, z);
    if (clientTile) {
      return {
        card_type: 6,
        definition: clientTile.definition,
        definition_id: clientTile.definition_id,
        world_q,
        world_r,
        z,
        id: String(clientTile.card_id),
      };
    }

    const definition_id = this.decodeServerZoneDefinitionId(server_zones[zone], local_q, local_r);
    if (definition_id === 0) {
      return null;
    }

    return {
      card_type: 6,
      definition: packDefinition(6, definition_id),
      definition_id,
      world_q,
      world_r,
      z,
      id: `zone:${zone}:${local_q}:${local_r}`,
    };
  }

  private resolveClientWorldTile(zone: number, world_q: number, world_r: number, z: number): ClientCard | null {
    const zoneCardIds = client_cards_by_zone[zone];
    if (!zoneCardIds) {
      return null;
    }

    for (const card_id of zoneCardIds) {
      const card = client_cards[card_id];
      if (!card) {
        continue;
      }

      if (card.card_type !== 6) {
        continue;
      }

      if (card.world_q !== world_q || card.world_r !== world_r || card.z !== z) {
        continue;
      }

      return card;
    }

    return null;
  }

  private decodeServerZoneDefinitionId(zone: ServerZone | undefined, local_q: number, local_r: number): number {
    if (!zone) {
      return 0;
    }

    const columns = [zone.t_0, zone.t_1, zone.t_2, zone.t_3, zone.t_4, zone.t_5, zone.t_6, zone.t_7];
    const packedColumn = columns[local_q] ?? 0n;
    const shifted = packedColumn >> BigInt(local_r * 8);
    return Number(shifted & 0xffn);
  }

  protected override hitTest(x: number, y: number, options?: { ignoreEntity?: HitEntity | null }): HitEntity | null {
    for (let index = this.content.children.length - 1; index >= 0; index -= 1) {
      const child = this.content.children[index];
      const bounds = child.getBounds();

      if (
        x < bounds.x ||
        x > bounds.x + bounds.width ||
        y < bounds.y ||
        y > bounds.y + bounds.height
      ) {
        continue;
      }

      const match = /^hex-card:(.+)$/.exec(child.label ?? "");
      if (!match) {
        continue;
      }

      const id = match[1];
      if (options?.ignoreEntity?.type === "tile" && String(options.ignoreEntity.id) === id) {
        continue;
      }

      return {
        type: "tile",
        id,
      };
    }

    return null;
  }
}

function resolveStyleColor(
  definition: { style?: { color?: Array<number | string> } } | undefined,
  index: number,
  fallback: number,
): number {
  const rawColor = definition?.style?.color?.[index];
  if (typeof rawColor === "number") {
    return rawColor;
  }

  if (typeof rawColor !== "string") {
    return fallback;
  }

  const normalized = rawColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  return Number.parseInt(normalized, 16);
}
