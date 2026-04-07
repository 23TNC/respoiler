import { Container, Text } from "pixi.js";
import { HexTileView } from "../components/hex_tile_view";
import type { EntityId, TrackedTile } from "../model";

type WorldBoardRenderParams = {
  tiles: TrackedTile[];
  selectedTileId?: EntityId;
  onTileSelect: (tileId: EntityId) => void;
};

export class WorldBoardRenderer {
  readonly container = new Container();
  private readonly tileRadius = 36;

  render(params: WorldBoardRenderParams): void {
    this.container.removeChildren();

    for (const trackedTile of params.tiles) {
      if (!trackedTile.tracker) {
        continue;
      }

      const x = this.axialToX(trackedTile.tracker.q, trackedTile.tracker.r);
      const y = this.axialToY(trackedTile.tracker.r, trackedTile.tracker.z);

      const view = new HexTileView({
        id: trackedTile.tile.tileId,
        label: `#${trackedTile.tile.tileId}`,
        color: 0x386641,
        radius: this.tileRadius,
        selected: params.selectedTileId === trackedTile.tile.tileId,
        onSelect: params.onTileSelect,
      });
      view.position.set(x, y);

      this.container.addChild(view);

      if (trackedTile.attachedCards.length > 0) {
        const attachedLabel = new Text({
          text: `${trackedTile.attachedCards.length} attached`,
          style: { fill: 0xf2f2f2, fontSize: 10 },
        });
        attachedLabel.anchor.set(0.5);
        attachedLabel.position.set(x, y + this.tileRadius + 14);
        this.container.addChild(attachedLabel);
      }
    }
  }

  private axialToX(q: number, r: number): number {
    return this.tileRadius * 1.5 * q + this.tileRadius * 0.75 * r;
  }

  private axialToY(r: number, z: number): number {
    return this.tileRadius * 1.7 * r - z * 8;
  }
}
