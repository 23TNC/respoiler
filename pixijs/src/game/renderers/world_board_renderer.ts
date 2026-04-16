import { Container, Text } from "pixi.js";
import { HexTileView } from "../components/hex_tile_view";
import type { EntityId } from "../model";

type WorldBoardRenderParams = {
  viewedTile?: {
    tileId: EntityId;
    q: number;
    r: number;
    z: number;
  };
  worldTiles: Array<{
    tileId: EntityId;
    q: number;
    r: number;
    z: number;
  }>;
  selectedTileId?: EntityId;
  onTileSelect: (tileId: EntityId) => void;
};

export type RenderedWorldTile = {
  tileId: EntityId;
  q: number;
  r: number;
  z: number;
};

export class WorldBoardRenderer {
  readonly container = new Container();
  private readonly tileRadius = 36;
  private readonly renderedTiles: Array<{ tile: RenderedWorldTile; view: HexTileView }> = [];

  render(params: WorldBoardRenderParams): void {
    this.container.removeChildren();
    this.renderedTiles.length = 0;

    const viewedTile = params.viewedTile;
    if (!viewedTile) {
      return;
    }

    const originQ = viewedTile.q;
    const originR = viewedTile.r;
    const originZ = viewedTile.z;

    const visibleTiles = params.worldTiles.length > 0 ? params.worldTiles : [viewedTile];
    visibleTiles.forEach((tile) => {
      const localQ = tile.q - originQ;
      const localR = tile.r - originR;
      const localZ = tile.z - originZ;
      const x = this.axialToX(localQ, localR);
      const y = this.axialToY(localR, localZ);

      const view = new HexTileView({
        id: tile.tileId,
        label: `#${tile.tileId}`,
        color: 0x2f6dff,
        radius: this.tileRadius,
        selected: params.selectedTileId === tile.tileId,
        onSelect: params.onTileSelect,
      });
      view.position.set(x, y);
      this.container.addChild(view);
      this.renderedTiles.push({
        tile: {
          tileId: tile.tileId,
          q: tile.q,
          r: tile.r,
          z: tile.z,
        },
        view,
      });
    });

    const coordinatesLabel = new Text({
      text: `q:${viewedTile.q} r:${viewedTile.r} z:${viewedTile.z}`,
      style: { fill: 0xf2f2f2, fontSize: 10 },
    });
    coordinatesLabel.anchor.set(0.5);
    coordinatesLabel.position.set(0, this.tileRadius + 14);
    this.container.addChild(coordinatesLabel);
  }

  findTopmostTileAt(globalX: number, globalY: number): RenderedWorldTile | undefined {
    for (let i = this.renderedTiles.length - 1; i >= 0; i -= 1) {
      const candidate = this.renderedTiles[i];
      if (candidate.view.hitTestGlobal(globalX, globalY)) {
        return candidate.tile;
      }
    }
    return undefined;
  }

  private axialToX(q: number, r: number): number {
    return this.tileRadius * 1.5 * q + this.tileRadius * 0.75 * r;
  }

  private axialToY(r: number, z: number): number {
    return this.tileRadius * 1.7 * r - z * 8;
  }
}
