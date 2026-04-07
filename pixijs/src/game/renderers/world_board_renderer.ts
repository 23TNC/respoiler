import { Container, Text } from "pixi.js";
import { HexTileView } from "../components/hex_tile_view";
import type { EntityId, TrackedCard, TrackedTile } from "../model";

type WorldBoardRenderParams = {
  tiles: TrackedTile[];
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

export class WorldBoardRenderer {
  readonly container = new Container();
  private readonly tileRadius = 36;
  private readonly tileAnchors: TileAnchor[] = [];

  render(params: WorldBoardRenderParams): void {
    this.container.removeChildren();
    this.tileAnchors.length = 0;

    for (const trackedTile of params.tiles) {
      if (!trackedTile.tracker) {
        continue;
      }

      const x = this.axialToX(trackedTile.tracker.q, trackedTile.tracker.r);
      const y = this.axialToY(trackedTile.tracker.r, trackedTile.tracker.z);
      const actionState = this.pickDominantActionState(trackedTile.attachedCards);

      const view = new HexTileView({
        id: trackedTile.tile.tileId,
        label: `#${trackedTile.tile.tileId}`,
        color: this.colorForActionState(actionState),
        radius: this.tileRadius,
        selected: params.selectedTileId === trackedTile.tile.tileId,
        onSelect: params.onTileSelect,
        onDrop: params.onTileDrop,
      });
      view.position.set(x, y);

      this.tileAnchors.push({ id: trackedTile.tile.tileId, x, y, radius: this.tileRadius });
      this.container.addChild(view);

      if (trackedTile.attachedCards.length > 0) {
        const attachedLabel = new Text({
          text: `${trackedTile.attachedCards.length} attached • ${this.stateLabel(actionState)}`,
          style: { fill: 0xf2f2f2, fontSize: 10 },
        });
        attachedLabel.anchor.set(0.5);
        attachedLabel.position.set(x, y + this.tileRadius + 14);
        this.container.addChild(attachedLabel);
      }
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

  private axialToX(q: number, r: number): number {
    return this.tileRadius * 1.5 * q + this.tileRadius * 0.75 * r;
  }

  private axialToY(r: number, z: number): number {
    return this.tileRadius * 1.7 * r - z * 8;
  }

  private pickDominantActionState(cards: TrackedCard[]): TrackedCard["actionState"] {
    if (cards.some((card) => card.actionState === "running")) {
      return "running";
    }
    if (cards.some((card) => card.actionState === "queued")) {
      return "queued";
    }
    if (cards.some((card) => card.actionState === "complete")) {
      return "complete";
    }
    return "staged";
  }

  private colorForActionState(state: TrackedCard["actionState"]): number {
    if (state === "queued") {
      return 0xb6902f;
    }
    if (state === "running") {
      return 0x2f7b42;
    }
    if (state === "complete") {
      return 0x3c6f8b;
    }
    return 0x4f5963;
  }

  private stateLabel(state: TrackedCard["actionState"]): string {
    if (state === "queued") {
      return "Q";
    }
    if (state === "running") {
      return "R";
    }
    if (state === "complete") {
      return "C";
    }
    return "I";
  }
}
