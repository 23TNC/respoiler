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
  selectedTileId?: EntityId;
  onTileSelect: (tileId: EntityId) => void;
};

export class WorldBoardRenderer {
  readonly container = new Container();
  private readonly tileRadius = 36;

  render(params: WorldBoardRenderParams): void {
    this.container.removeChildren();

    const viewedTile = params.viewedTile;
    if (!viewedTile) {
      return;
    }

    const originQ = viewedTile.q;
    const originR = viewedTile.r;
    const originZ = viewedTile.z;
    const localQ = viewedTile.q - originQ;
    const localR = viewedTile.r - originR;
    const localZ = viewedTile.z - originZ;

    const x = this.axialToX(localQ, localR);
    const y = this.axialToY(localR, localZ);

    const view = new HexTileView({
      id: viewedTile.tileId,
      label: `#${viewedTile.tileId}`,
      color: 0x2f6dff,
      radius: this.tileRadius,
      selected: params.selectedTileId === viewedTile.tileId,
      onSelect: params.onTileSelect,
    });
    view.position.set(x, y);
    this.container.addChild(view);

    const coordinatesLabel = new Text({
      text: `q:${viewedTile.q} r:${viewedTile.r} z:${viewedTile.z}`,
      style: { fill: 0xf2f2f2, fontSize: 10 },
    });
    coordinatesLabel.anchor.set(0.5);
    coordinatesLabel.position.set(x, y + this.tileRadius + 14);
    this.container.addChild(coordinatesLabel);
  }

  private axialToX(q: number, r: number): number {
    return this.tileRadius * 1.5 * q + this.tileRadius * 0.75 * r;
  }

  private axialToY(r: number, z: number): number {
    return this.tileRadius * 1.7 * r - z * 8;
  }
}
