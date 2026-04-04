import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CardDefinition } from '../cards/types';

export const CARD_WIDTH = 70;
export const CARD_HEIGHT = 34;

interface CardRenderOptions {
  x: number;
  y: number;
  card: CardDefinition;
  width?: number;
  height?: number;
}

export function renderOvalCard(container: Container, options: CardRenderOptions): Rectangle {
  const width = options.width ?? CARD_WIDTH;
  const height = options.height ?? CARD_HEIGHT;
  const radiusX = width / 2;
  const radiusY = height / 2;
  const centerX = options.x + radiusX;
  const centerY = options.y + radiusY;

  const bg = new Graphics();
  bg.ellipse(centerX, centerY, radiusX, radiusY).fill({ color: options.card.backgroundColor, alpha: 0.96 }).stroke({
    color: 0x1b2537,
    width: 1,
  });
  container.addChild(bg);

  const label = new Text({
    text: options.card.name,
    style: { fill: '#111827', fontSize: 10, fontWeight: '700', align: 'center' },
  });
  label.anchor.set(0.5);
  label.position.set(centerX, centerY);
  container.addChild(label);

  return new Rectangle(options.x, options.y, width, height);
}

export function pointInOval(globalX: number, globalY: number, bounds: Rectangle): boolean {
  const centerX = bounds.x + bounds.width * 0.5;
  const centerY = bounds.y + bounds.height * 0.5;
  const rx = bounds.width * 0.5;
  const ry = bounds.height * 0.5;
  const dx = (globalX - centerX) / rx;
  const dy = (globalY - centerY) / ry;
  return dx * dx + dy * dy <= 1;
}
