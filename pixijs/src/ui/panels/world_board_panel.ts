import { client_cards, client_cards_by_zone, packZone, server_zones, type ClientCard, type ServerZone } from "../../spacetime/data";
import { createHexCardView } from "../hexagon/card_renderer";
import { worldHexToPanelPixel } from "../hexagon/grid";
import { computeHexTileSize } from "../hexagon/layout";
import type { HitEntity } from "../input/types";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

interface DisplayWorldTile {
  card_type: 6;
  definition_id: number;
  world_q: number;
  world_r: number;
  z: number;
  id: string;
}

export class WorldBoardPanel extends Panel {
  private readonly viewport_q = 0;
  private readonly viewport_r = 0;
  private readonly z = 1;

  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  override refresh(_screenWidth: number, screenHeight: number): void {
    this.clearContent();

    const innerRect = this.getInnerRect();
    const hexSize = computeHexTileSize(screenHeight);
    const worldOrigin = {
      x: innerRect.x + (innerRect.width / 2),
      y: innerRect.y + (innerRect.height / 2),
    };

    const viewport_zone_q = Math.floor(this.viewport_q / 8);
    const viewport_zone_r = Math.floor(this.viewport_r / 8);
    const viewport_local_q = ((this.viewport_q % 8) + 8) % 8;
    const viewport_local_r = ((this.viewport_r % 8) + 8) % 8;
    const neighbor_zone_q = viewport_local_q < 4 ? viewport_zone_q - 1 : viewport_zone_q + 1;
    const neighbor_zone_r = viewport_local_r < 4 ? viewport_zone_r - 1 : viewport_zone_r + 1;

    this.renderZone(viewport_zone_q, viewport_zone_r, this.z, hexSize, screenHeight, worldOrigin);
    this.renderZone(neighbor_zone_q, viewport_zone_r, this.z, hexSize, screenHeight, worldOrigin);
    this.renderZone(viewport_zone_q, neighbor_zone_r, this.z, hexSize, screenHeight, worldOrigin);
    this.renderZone(neighbor_zone_q, neighbor_zone_r, this.z, hexSize, screenHeight, worldOrigin);
  }

  private renderZone(
    zone_q: number,
    zone_r: number,
    z: number,
    hexSize: number,
    screenHeight: number,
    worldOrigin: { x: number; y: number },
  ): void {
    const zone = packZone(zone_q, zone_r, z);

    for (let local_q = 0; local_q < 8; local_q += 1) {
      for (let local_r = 0; local_r < 8; local_r += 1) {
        const world_q = zone_q * 8 + local_q;
        const world_r = zone_r * 8 + local_r;
        const tile = this.resolveDisplayedWorldTile(zone, world_q, world_r, local_q, local_r, z);
        if (!tile) {
          continue;
        }

        const pixel = worldHexToPanelPixel(
          {
            q: tile.world_q - this.viewport_q,
            r: tile.world_r - this.viewport_r,
          },
          hexSize,
          worldOrigin,
        );

        const hexCard = createHexCardView(
          {
            id: tile.id,
            type: 6,
            name: `#${tile.definition_id}`,
            colors: [0xd3deef],
            progress: 0,
            progressDirection: "clockwise",
            progressFillColor: 0x8da6c6,
            progressEmptyColor: 0x32475f,
          },
          {
            centerX: pixel.x,
            centerY: pixel.y,
            size: hexSize,
            screenHeight,
          },
        );

        this.content.addChild(hexCard);
      }
    }
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
      if (!child.getBounds().contains(x, y)) {
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
