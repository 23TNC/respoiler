import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { StagedTileAction } from '../actions/types';
import type { SoulHostedTileModel, SoulModel } from '../characters/types';
import type { TileTypeDefinition } from '../world/types';

interface HostedTileVisual {
  tileId: string;
  bounds: Rectangle;
}

export class SoulHostedTilesUI {
  readonly root = new Container();

  private readonly tileVisuals: HostedTileVisual[] = [];

  constructor(
    private readonly getViewedSoul: () => SoulModel,
    private readonly getViewedHostedTiles: () => SoulHostedTileModel[],
    private readonly tileTypeById: Map<string, TileTypeDefinition>,
    private readonly getStagedForTile: (tileId: string) => StagedTileAction | undefined,
    private readonly isSelectedTile: (tileId: string) => boolean,
  ) {}

  setPosition(x: number, y: number): void {
    this.root.position.set(x, y);
    this.render();
  }

  tileAtPoint(globalX: number, globalY: number): string | null {
    for (const tileVisual of this.tileVisuals) {
      const bounds = new Rectangle(
        this.root.position.x + tileVisual.bounds.x,
        this.root.position.y + tileVisual.bounds.y,
        tileVisual.bounds.width,
        tileVisual.bounds.height,
      );
      if (bounds.contains(globalX, globalY)) {
        return tileVisual.tileId;
      }
    }
    return null;
  }

  size(): { width: number; height: number } {
    const rows = Math.max(1, this.getViewedHostedTiles().length);
    return {
      width: 360,
      height: 44 + rows * 40,
    };
  }

  render(): void {
    this.root.removeChildren();
    this.tileVisuals.length = 0;

    const soul = this.getViewedSoul();
    const hostedTiles = this.getViewedHostedTiles();
    const { width, height } = this.size();

    const panel = new Graphics();
    panel.roundRect(0, 0, width, height, 10).fill({ color: 0x0b1320, alpha: 0.9 }).stroke({
      color: 0x2d4772,
      width: 2,
    });
    this.root.addChild(panel);

    const title = new Text({
      text: `${soul.name} Event Tiles`,
      style: { fill: '#dce9ff', fontSize: 12, fontWeight: '700' },
    });
    title.position.set(10, 8);
    this.root.addChild(title);

    if (hostedTiles.length === 0) {
      const empty = new Text({ text: 'No hosted tiles for this soul.', style: { fill: '#8ca5c9', fontSize: 11 } });
      empty.position.set(10, 24);
      this.root.addChild(empty);
      return;
    }

    hostedTiles.forEach((tile, index) => {
      const tileType = this.tileTypeById.get(tile.tileType);
      const staged = this.getStagedForTile(tile.id);
      const y = 26 + index * 38;
      const selected = this.isSelectedTile(tile.id);

      const entry = new Graphics();
      entry.roundRect(8, y, width - 16, 32, 8).fill({ color: selected ? 0x2f4768 : 0x16253d, alpha: 1 }).stroke({
        color: selected ? 0xfff6a0 : 0x4a6693,
        width: selected ? 2 : 1,
      });
      this.root.addChild(entry);

      const name = new Text({
        text: tile.eventLabel,
        style: { fill: tileType?.style.labelColor ?? '#f6ebff', fontSize: 11, fontWeight: '700' },
      });
      name.position.set(14, y + 7);
      this.root.addChild(name);

      const status = new Text({
        text: staged ? `${staged.status.toUpperCase()} • ${staged.inputCardInstanceIds.length} inputs` : 'Ready',
        style: { fill: staged?.status === 'queued' ? '#95f2a8' : '#9ac4ff', fontSize: 10 },
      });
      status.position.set(width - 120, y + 9);
      this.root.addChild(status);

      this.tileVisuals.push({
        tileId: tile.id,
        bounds: new Rectangle(8, y, width - 16, 32),
      });
    });
  }
}
