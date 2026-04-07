import { Container } from "pixi.js";
import { HexTileView } from "../components/hex_tile_view";
import type { EntityId, TrackedTile } from "../model";

type EventTile = TrackedTile & { createTime: number };

type EventColumnRenderParams = {
  tiles: EventTile[];
  selectedTileId?: EntityId;
  onTileSelect: (tileId: EntityId) => void;
  onTileDrop: (tileId: EntityId) => void;
};

type TileAnchor = {
  id: EntityId;
  x: number;
  y: number;
  radius: number;
};

export class EventColumnRenderer {
  readonly container = new Container();
  private readonly tileAnchors: TileAnchor[] = [];

  render(params: EventColumnRenderParams): void {
    this.container.removeChildren();
    this.tileAnchors.length = 0;

    const spacing = 82;
    const startY = 0;
    for (let i = 0; i < params.tiles.length; i += 1) {
      const tile = params.tiles[i];
      const radius = 30;
      const y = startY - i * spacing;
      const view = new HexTileView({
        id: tile.tile.tileId,
        label: `E${i + 1}`,
        color: 0x8d6a9f,
        radius,
        selected: params.selectedTileId === tile.tile.tileId,
        onSelect: params.onTileSelect,
        onDrop: params.onTileDrop,
      });
      view.position.set(0, y);
      this.tileAnchors.push({ id: tile.tile.tileId, x: 0, y, radius });
      this.container.addChild(view);
    }
  }

  getTileAtGlobalPoint(globalX: number, globalY: number): EntityId | undefined {
    const localPoint = this.container.toLocal({ x: globalX, y: globalY });
    return this.tileAnchors.find((tile) => {
      const dx = localPoint.x - tile.x;
      const dy = localPoint.y - tile.y;
      return dx * dx + dy * dy <= tile.radius * tile.radius;
    })?.id;
  }
}
