import { Container } from "pixi.js";
import { HexTileView } from "../components/hex_tile_view";
import type { EntityId, TrackedTile } from "../model";

type EventTile = TrackedTile & { createTime: number };

type EventColumnRenderParams = {
  tiles: EventTile[];
  selectedTileId?: EntityId;
  onTileSelect: (tileId: EntityId) => void;
};

export class EventColumnRenderer {
  readonly container = new Container();

  render(params: EventColumnRenderParams): void {
    this.container.removeChildren();

    const spacing = 72;
    const startY = 0;
    for (let i = 0; i < params.tiles.length; i += 1) {
      const tile = params.tiles[i];
      const view = new HexTileView({
        id: tile.tile.cardId,
        label: `E${i + 1}`,
        color: 0x8d6a9f,
        radius: 26,
        selected: params.selectedTileId === tile.tile.cardId,
        onSelect: params.onTileSelect,
      });
      view.position.set(0, startY - i * spacing);
      this.container.addChild(view);
    }
  }
}
