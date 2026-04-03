import { Container, Graphics, Point, Polygon, Text } from 'pixi.js';
import { axialKey, axialToPixel, pixelToAxial } from '../hex/coords';
import type { AxialCoord } from '../hex/coords';
import type { HexTile, TileTypeDefinition } from '../world/types';

interface RenderContext {
  tileTypeById: Map<string, TileTypeDefinition>;
}

export interface RenderedTileActionBadge {
  verbId: string;
  verbLabel: string;
  tileLabel?: string;
  stagedCardNames: string[];
  repeat: boolean;
  status: 'staged' | 'queued';
}

export type DropFeedbackState = 'none' | 'valid' | 'invalid';

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
      shape.eventMode = 'static';
      shape.cursor = 'pointer';
      shape.hitArea = new Polygon(this.hexPoints(this.size));
      shape.on('pointerdown', () => onTileSelected({ q: tile.q, r: tile.r }));
      shape.poly(this.hexPoints(this.size), true).fill(tileType.style.fillColor).stroke({
        color: tileType.style.strokeColor,
        width: 2,
      });

      const staged = stagedByTileId.get(tile.id);
      const textBlock = new Container();
      textBlock.position.set(0, 0);

      const titleText = new Text(staged?.tileLabel ? `${staged.verbLabel} (${staged.tileLabel})` : tileType.name, {
        fontSize: 12,
        fill: staged ? this.colorForVerb(staged.verbId) : tileType.style.labelColor,
        fontWeight: '700',
      });
      titleText.anchor.set(0.5, 0);
      titleText.position.set(0, 0);
      textBlock.addChild(titleText);

      let lineY = titleText.height + 1;
      if (staged) {
        const metaText = new Text(`${staged.status === 'queued' ? 'Q' : 'S'} · ${staged.repeat ? 'R' : '-'}`, {
          fontSize: 9,
          fill: '#e7d2a0',
          fontWeight: '700',
        });
        metaText.anchor.set(0.5, 0);
        metaText.position.set(0, lineY);
        textBlock.addChild(metaText);
        lineY += metaText.height + 1;

        const stagedCardsText = new Text(`Cards: ${staged.stagedCardNames.length > 0 ? staged.stagedCardNames.join(', ') : 'None'}`, {
          fontSize: 9,
          fill: '#d4ddf0',
          fontWeight: '600',
        });
        stagedCardsText.anchor.set(0.5, 0);
        stagedCardsText.position.set(0, lineY);
        textBlock.addChild(stagedCardsText);
        lineY += stagedCardsText.height + 1;
      }

      if (tile.hiddenPresenceCount > 0) {
        const hiddenText = new Text(`Hidden: ${tile.hiddenPresenceCount}`, {
          fontSize: 9,
          fill: '#ffd37e',
          fontWeight: '600',
        });
        hiddenText.anchor.set(0.5, 0);
        hiddenText.position.set(0, lineY);
        textBlock.addChild(hiddenText);
      }

      const blockHeight = Math.max(12, textBlock.height);
      const hitProxy = new Graphics();
      hitProxy.eventMode = 'static';
      hitProxy.cursor = 'pointer';
      hitProxy.hitArea = new Polygon([-58, -2, 58, -2, 58, blockHeight + 2, -58, blockHeight + 2]);
      hitProxy.on('pointerdown', () => onTileSelected({ q: tile.q, r: tile.r }));

      container.addChild(shape, textBlock, hitProxy);

      this.worldHexLayer.addChild(container);

      const tileKey = axialKey({ q: tile.q, r: tile.r });
      tileByKey.set(tileKey, tile);
      tileCenterByKey.set(tileKey, px);

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
    const localPoint = this.root.toLocal(new Point(localX, localY));
    return pixelToAxial(localPoint.x, localPoint.y, this.size);
  }

  tileKey(coord: AxialCoord): string {
    return axialKey(coord);
  }

  private colorForVerb(verbId: string): string {
    const palette = ['#ffe59a', '#9af3b1', '#9dd6ff', '#f5a8ff', '#ffb783', '#b8f29f'];
    let hash = 0;
    for (let i = 0; i < verbId.length; i += 1) {
      hash = (hash * 31 + verbId.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }
}
