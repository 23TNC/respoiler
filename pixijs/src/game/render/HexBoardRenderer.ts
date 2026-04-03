import { Container, Graphics, Text } from 'pixi.js';
import { axialKey, axialToPixel, pixelToAxial } from '../hex/coords';
import type { AxialCoord } from '../hex/coords';
import type { HexTile, TileTypeDefinition } from '../world/types';

interface RenderContext {
  tileTypeById: Map<string, TileTypeDefinition>;
}

export interface RenderedTileActionBadge {
  verbLabel: string;
  inputCount: number;
  repeat: boolean;
  status: 'staged' | 'queued';
}

export class HexBoardRenderer {
  readonly root = new Container();

  readonly worldBaseLayer = new Container();

  readonly worldHexLayer = new Container();

  readonly worldOverlayLayer = new Container();

  readonly stagedActionLayer = new Container();

  private readonly size: number;

  private hoverTileKey: string | null = null;

  private dropHoverTileKey: string | null = null;

  constructor(size = 42) {
    this.size = size;

    this.root.sortableChildren = true;
    this.worldBaseLayer.zIndex = 0;
    this.worldHexLayer.zIndex = 10;
    this.worldOverlayLayer.zIndex = 20;
    this.stagedActionLayer.zIndex = 30;
    this.root.addChild(this.worldBaseLayer, this.worldHexLayer, this.worldOverlayLayer, this.stagedActionLayer);
  }

  setDropHoverTile(tileKey: string | null): void {
    this.dropHoverTileKey = tileKey;
  }

  setPointerHoverTile(tileKey: string | null): void {
    this.hoverTileKey = tileKey;
  }

  renderTiles(
    tiles: Iterable<HexTile>,
    context: RenderContext,
    onTileSelected: (coord: AxialCoord) => void,
    stagedByTileId: Map<string, RenderedTileActionBadge> = new Map(),
  ): void {
    this.worldHexLayer.removeChildren();
    this.worldOverlayLayer.removeChildren();
    this.stagedActionLayer.removeChildren();

    const tileByKey = new Map<string, HexTile>();
    const tileCenterByKey = new Map<string, { x: number; y: number }>();

    for (const tile of tiles) {
      const tileType = context.tileTypeById.get(tile.tileType);
      if (!tileType) {
        continue;
      }

      const container = new Container();
      const px = axialToPixel({ q: tile.q, r: tile.r }, this.size);
      container.position.set(px.x, px.y);

      const shape = new Graphics();
      shape.poly(this.hexPoints(this.size), true).fill(tileType.style.fillColor).stroke({
        color: tileType.style.strokeColor,
        width: 2,
      });
      shape.eventMode = 'static';
      shape.cursor = 'pointer';
      shape.on('pointerdown', () => onTileSelected({ q: tile.q, r: tile.r }));

      const tileLabel = new Text({
        text: tileType.name,
        style: {
          fontSize: 12,
          fill: tileType.style.labelColor,
          fontWeight: '700',
        },
      });
      tileLabel.anchor.set(0.5, 0.6);
      tileLabel.position.set(0, -4);

      container.addChild(shape, tileLabel);

      if (tile.hiddenPresenceCount > 0) {
        const hiddenBadge = new Graphics();
        hiddenBadge.roundRect(-21, 10, 42, 16, 8).fill({ color: 0x2d324a, alpha: 0.95 }).stroke({ color: 0xe3bd6a, width: 1 });

        const hiddenText = new Text({
          text: `? ${tile.hiddenPresenceCount}`,
          style: {
            fontSize: 9,
            fill: '#ffd37e',
            fontWeight: '700',
          },
        });
        hiddenText.anchor.set(0.5, 0.5);
        hiddenText.position.set(0, 18);

        container.addChild(hiddenBadge, hiddenText);
      }

      this.worldHexLayer.addChild(container);

      const tileKey = axialKey({ q: tile.q, r: tile.r });
      tileByKey.set(tileKey, tile);
      tileCenterByKey.set(tileKey, px);

      const staged = stagedByTileId.get(tile.id);
      if (staged) {
        const overlay = new Container();
        overlay.position.set(px.x, px.y - this.size - 10);

        const bg = new Graphics();
        bg.roundRect(-48, -16, 96, 32, 8).fill({ color: 0x0d1524, alpha: 0.95 }).stroke({
          color: staged.status === 'queued' ? 0x71dc93 : 0xffcc66,
          width: 1,
        });

        const verbText = new Text({
          text: staged.verbLabel,
          style: {
            fontSize: 10,
            fill: '#f8e3b4',
            fontWeight: '700',
          },
        });
        verbText.anchor.set(0, 0.5);
        verbText.position.set(-43, -5);

        const metaText = new Text({
          text: `${staged.status === 'queued' ? 'Q' : 'S'} · ${staged.inputCount} · ${staged.repeat ? 'R' : '-'}`,
          style: {
            fontSize: 8,
            fill: staged.status === 'queued' ? '#9af3b1' : '#ffd999',
            fontWeight: '700',
          },
        });
        metaText.anchor.set(0, 0.5);
        metaText.position.set(-43, 8);

        overlay.addChild(bg, verbText, metaText);
        this.stagedActionLayer.addChild(overlay);
      }
    }

    this.drawHighlight(tileCenterByKey.get(this.hoverTileKey ?? ''), 0x8cc7ff, this.size + 2, 2);
    this.drawHighlight(tileCenterByKey.get(this.dropHoverTileKey ?? ''), 0x80f5b4, this.size + 4, 3);

    for (const [tileKey, tile] of tileByKey.entries()) {
      if (!tile.selected) {
        continue;
      }
      this.drawHighlight(tileCenterByKey.get(tileKey), 0xfff6a0, this.size + 4, 4);
    }
  }

  private drawHighlight(center: { x: number; y: number } | undefined, color: number, radius: number, width: number): void {
    if (!center) {
      return;
    }

    const ring = new Graphics();
    ring.poly(this.hexPoints(radius), true).stroke({ color, width });
    ring.position.set(center.x, center.y);
    this.worldOverlayLayer.addChild(ring);
  }

  private hexPoints(radius: number): number[] {
    const points: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI / 180) * (60 * i - 30);
      points.push(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    return points;
  }

  centerOn(width: number, height: number): void {
    this.root.position.set(width / 2, height / 2);
  }

  tileAtPixel(localX: number, localY: number): AxialCoord {
    const translatedX = localX - this.root.position.x;
    const translatedY = localY - this.root.position.y;
    return pixelToAxial(translatedX, translatedY, this.size);
  }

  tileKey(coord: AxialCoord): string {
    return axialKey(coord);
  }
}
