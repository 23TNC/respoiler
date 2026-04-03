import { Container, Graphics, Text } from 'pixi.js';
import { axialKey, axialToPixel, pixelToAxial } from '../hex/coords';
import type { AxialCoord } from '../hex/coords';
import type { HexTile, TileTypeDefinition, VerbDefinition } from '../world/types';

interface RenderContext {
  tileTypeById: Map<string, TileTypeDefinition>;
  verbById: Map<string, VerbDefinition>;
}

interface StagedActionBadge {
  verbId: string;
  status: 'staged' | 'queued';
}

export class HexBoardRenderer {
  readonly root = new Container();

  private readonly size: number;

  constructor(size = 42) {
    this.size = size;
  }

  renderTiles(
    tiles: Iterable<HexTile>,
    context: RenderContext,
    onTileSelected: (coord: AxialCoord) => void,
    stagedByTileId: Map<string, StagedActionBadge> = new Map(),
  ): void {
    this.root.removeChildren();

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
        color: tile.selected ? '#fff6a0' : tileType.style.strokeColor,
        width: tile.selected ? 4 : 2,
      });
      shape.eventMode = 'static';
      shape.cursor = 'pointer';
      shape.on('pointerdown', () => onTileSelected({ q: tile.q, r: tile.r }));

      const nameText = new Text({
        text: tileType.name,
        style: {
          fontSize: 11,
          fill: tileType.style.labelColor,
          fontWeight: '600',
        },
      });
      nameText.anchor.set(0.5, 0.6);
      nameText.position.set(0, -4);

      const sideText = new Text({
        text: tile.visibleSides.slice(0, 3).join(' · '),
        style: {
          fontSize: 9,
          fill: '#ffffff',
        },
      });
      sideText.anchor.set(0.5, 0.5);
      sideText.position.set(0, 10);

      const hiddenText = new Text({
        text: tile.hiddenPresenceCount > 0 ? `?${tile.hiddenPresenceCount}` : '',
        style: {
          fontSize: 10,
          fill: '#ffd37e',
          fontWeight: '700',
        },
      });
      hiddenText.anchor.set(1, 0);
      hiddenText.position.set(this.size * 0.68, -this.size * 0.8);

      const verbNames = tile.activeVerbs
        .map((id) => context.verbById.get(id)?.name)
        .filter((value): value is string => Boolean(value));
      const verbText = new Text({
        text: verbNames.length > 0 ? `⚙ ${verbNames.join(', ')}` : '',
        style: {
          fontSize: 8,
          fill: '#d8e7ff',
        },
      });
      verbText.anchor.set(0.5, 0);
      verbText.position.set(0, this.size * 0.35);

      container.addChild(shape, nameText, sideText, hiddenText, verbText);

      const staged = stagedByTileId.get(tile.id);
      if (staged) {
        const stagedVerb = context.verbById.get(staged.verbId)?.name ?? staged.verbId;
        const badge = new Graphics();
        badge.roundRect(-this.size * 0.58, -this.size * 1.16, this.size * 1.16, 16, 5).fill({
          color: staged.status === 'queued' ? 0x6ac98f : 0xffcc66,
          alpha: 1,
        });

        const stagedText = new Text({
          text: `${stagedVerb} • ${staged.status}`,
          style: {
            fontSize: 8,
            fill: '#11151c',
            fontWeight: '700',
          },
        });
        stagedText.anchor.set(0.5, 0.5);
        stagedText.position.set(0, -this.size * 1.02);

        container.addChild(badge, stagedText);
      }

      this.root.addChild(container);
    }
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
