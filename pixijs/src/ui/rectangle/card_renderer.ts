import { Container, Graphics, Text } from "pixi.js";

import type { CardLayoutRect } from "./card_layout";

export type ProgressDirection = "clockwise" | "counterclockwise";

export interface RectangleCard {
  id: string;
  name: string;
  colors: [number, number, number?];
  progress: number;
  progressDirection: ProgressDirection;
  progressFillColor: number;
  progressEmptyColor: number;
}

interface ProgressOutlineConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  value: number;
  direction: ProgressDirection;
  fillColor: number;
  emptyColor: number;
  strokeWidth: number;
}

export function createRectangleCardView(
  card: RectangleCard,
  layoutRect: CardLayoutRect,
  cardPadding: number,
  screenHeight: number,
): Container {
  const container = new Container();
  const graphics = new Graphics();

  const innerX = layoutRect.x + (2 * cardPadding);
  const innerY = layoutRect.y + (2 * cardPadding);
  const innerWidth = Math.max(0, layoutRect.width - (4 * cardPadding));
  const innerHeight = Math.max(0, layoutRect.height - (4 * cardPadding));
  const cornerRadius = Math.max(1, cardPadding * 1.5);

  const topSectionHeight = (5 / 8) * innerHeight;
  const bottomSectionHeight = (3 / 8) * innerHeight;

  graphics.roundRect(innerX, innerY, innerWidth, innerHeight, cornerRadius).fill({ color: card.colors[0], alpha: 1 });
  graphics.rect(innerX, innerY + topSectionHeight, innerWidth, bottomSectionHeight).fill({ color: card.colors[1], alpha: 1 });

  drawCardProgressOutline(graphics, {
    x: innerX,
    y: innerY,
    width: innerWidth,
    height: innerHeight,
    radius: cornerRadius,
    value: card.progress,
    direction: card.progressDirection,
    fillColor: card.progressFillColor,
    emptyColor: card.progressEmptyColor,
    strokeWidth: Math.max(1, cardPadding * 0.9),
  });

  const text = new Text({
    text: card.name,
    style: {
      fill: card.colors[2] ?? 0xf4f8ff,
      fontFamily: "Segoe UI",
      fontSize: Math.round(screenHeight / 70),
      fontWeight: "700",
      align: "center",
    },
  });

  text.anchor.set(0.5, 0.5);
  text.x = Math.round(innerX + (innerWidth / 2));
  text.y = Math.round(innerY + topSectionHeight + (bottomSectionHeight / 2));

  container.addChild(graphics);
  container.addChild(text);

  return container;
}

function drawCardProgressOutline(graphics: Graphics, config: ProgressOutlineConfig): void {
  const value = Math.max(0, Math.min(1, config.value));
  const radius = Math.max(0, Math.min(config.radius, config.width / 2, config.height / 2));

  graphics
    .roundRect(config.x, config.y, config.width, config.height, radius)
    .stroke({ color: config.emptyColor, width: config.strokeWidth, alpha: 1 });

  if (value <= 0) {
    return;
  }

  const straightTopBottom = Math.max(0, config.width - (2 * radius));
  const straightLeftRight = Math.max(0, config.height - (2 * radius));
  const cornerArcLength = (Math.PI / 2) * radius;
  const perimeter =
    (2 * straightTopBottom) +
    (2 * straightLeftRight) +
    (4 * cornerArcLength);

  const x0 = config.x;
  const y0 = config.y;
  const x1 = config.x + config.width;
  const y1 = config.y + config.height;

  let remaining = perimeter * value;

  if (config.direction === "clockwise") {
    graphics.moveTo(x0 + radius, y0);
    remaining = drawLineProgress(graphics, x0 + radius, y0, x1 - radius, y0, remaining);
    remaining = drawArcProgress(graphics, x1 - radius, y0 + radius, radius, -Math.PI / 2, 0, remaining, false);
    remaining = drawLineProgress(graphics, x1, y0 + radius, x1, y1 - radius, remaining);
    remaining = drawArcProgress(graphics, x1 - radius, y1 - radius, radius, 0, Math.PI / 2, remaining, false);
    remaining = drawLineProgress(graphics, x1 - radius, y1, x0 + radius, y1, remaining);
    remaining = drawArcProgress(graphics, x0 + radius, y1 - radius, radius, Math.PI / 2, Math.PI, remaining, false);
    remaining = drawLineProgress(graphics, x0, y1 - radius, x0, y0 + radius, remaining);
    drawArcProgress(graphics, x0 + radius, y0 + radius, radius, Math.PI, (3 * Math.PI) / 2, remaining, false);
  } else {
    graphics.moveTo(x0, y0 + radius);
    remaining = drawLineProgress(graphics, x0, y0 + radius, x0, y1 - radius, remaining);
    remaining = drawArcProgress(graphics, x0 + radius, y1 - radius, radius, Math.PI, Math.PI / 2, remaining, true);
    remaining = drawLineProgress(graphics, x0 + radius, y1, x1 - radius, y1, remaining);
    remaining = drawArcProgress(graphics, x1 - radius, y1 - radius, radius, Math.PI / 2, 0, remaining, true);
    remaining = drawLineProgress(graphics, x1, y1 - radius, x1, y0 + radius, remaining);
    remaining = drawArcProgress(graphics, x1 - radius, y0 + radius, radius, 0, -Math.PI / 2, remaining, true);
    remaining = drawLineProgress(graphics, x1 - radius, y0, x0 + radius, y0, remaining);
    drawArcProgress(graphics, x0 + radius, y0 + radius, radius, -Math.PI / 2, Math.PI, remaining, true);
  }

  graphics.stroke({ color: config.fillColor, width: config.strokeWidth, alpha: 1 });
}

function drawLineProgress(
  graphics: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  remaining: number,
): number {
  if (remaining <= 0) {
    return 0;
  }

  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);

  if (length <= 0) {
    return remaining;
  }

  const drawLength = Math.min(length, remaining);
  const t = drawLength / length;

  graphics.lineTo(x0 + (dx * t), y0 + (dy * t));

  return remaining - drawLength;
}

function drawArcProgress(
  graphics: Graphics,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  remaining: number,
  anticlockwise: boolean,
): number {
  if (remaining <= 0 || radius <= 0) {
    return remaining;
  }

  let delta = endAngle - startAngle;

  if (anticlockwise) {
    if (delta > 0) {
      delta -= Math.PI * 2;
    }
  } else if (delta < 0) {
    delta += Math.PI * 2;
  }

  const arcLength = Math.abs(delta) * radius;

  if (arcLength <= 0) {
    return remaining;
  }

  const drawLength = Math.min(arcLength, remaining);
  const t = drawLength / arcLength;
  const partialEndAngle = startAngle + (delta * t);

  graphics.arc(cx, cy, radius, startAngle, partialEndAngle, anticlockwise);

  return remaining - drawLength;
}
