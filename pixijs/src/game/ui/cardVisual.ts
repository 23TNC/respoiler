import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CardDefinition } from '../cards/types';

export const CARD_WIDTH = 70;
export const CARD_HEIGHT = 22;
export const CARD_RADIUS = 8;

interface CardRenderOptions {
  x: number;
  y: number;
  card: CardDefinition;
  width?: number;
  height?: number;
}

const DARK_TEXT = '#111827';
const LIGHT_TEXT = '#f8fbff';

export function readableTextColor(backgroundColor: number): string {
  const r = (backgroundColor >> 16) & 0xff;
  const g = (backgroundColor >> 8) & 0xff;
  const b = backgroundColor & 0xff;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? DARK_TEXT : LIGHT_TEXT;
}

export function renderCardTag(container: Container, options: CardRenderOptions): Rectangle {
  const width = options.width ?? CARD_WIDTH;
  const height = options.height ?? CARD_HEIGHT;
  const cornerRadius = Math.min(CARD_RADIUS, Math.floor(Math.min(width, height) / 2));
  const centerX = options.x + width / 2;
  const centerY = options.y + height / 2;

  const bg = new Graphics();
  bg.roundRect(options.x, options.y, width, height, cornerRadius).fill({ color: options.card.backgroundColor, alpha: 0.96 }).stroke({
    color: 0x1b2537,
    width: 1,
  });
  container.addChild(bg);

  const label = new Text({
    text: options.card.name,
    style: { fill: readableTextColor(options.card.backgroundColor), fontSize: 10, fontWeight: '700', align: 'center' },
  });
  label.anchor.set(0.5);
  label.position.set(centerX, centerY);
  container.addChild(label);

  return new Rectangle(options.x, options.y, width, height);
}

export function pointInRoundedRect(globalX: number, globalY: number, bounds: Rectangle, radius = CARD_RADIUS): boolean {
  if (!bounds.contains(globalX, globalY)) {
    return false;
  }

  const r = Math.min(radius, bounds.width / 2, bounds.height / 2);
  const left = bounds.x;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const bottom = bounds.y + bounds.height;

  if ((globalX >= left + r && globalX <= right - r) || (globalY >= top + r && globalY <= bottom - r)) {
    return true;
  }

  const cx = globalX < left + r ? left + r : right - r;
  const cy = globalY < top + r ? top + r : bottom - r;
  const dx = globalX - cx;
  const dy = globalY - cy;
  return dx * dx + dy * dy <= r * r;
}
