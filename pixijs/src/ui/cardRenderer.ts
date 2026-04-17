import { Container, Graphics, Text } from "pixi.js";

import type { CardLayoutRect } from "./cardLayout";

export type ProgressDirection = "clockwise" | "counterclockwise";

export interface DebugCard {
  id: string;
  name: string;
  colors: [number, number];
  progress: number;
  progressDirection: ProgressDirection;
  progressFillColor: number;
  progressEmptyColor: number;
}

interface Point {
  x: number;
  y: number;
}

export function createCardView(
  card: DebugCard,
  layoutRect: CardLayoutRect,
  cardPadding: number,
  screenHeight: number,
): Container {
  const container = new Container();
  const graphics = new Graphics();

  const innerX = layoutRect.x + cardPadding;
  const innerY = layoutRect.y + cardPadding;
  const innerWidth = Math.max(0, layoutRect.width - (2 * cardPadding));
  const innerHeight = Math.max(0, layoutRect.height - (2 * cardPadding));
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
      fill: 0xf4f8ff,
      fontFamily: "Arial",
      fontSize: Math.max(11, screenHeight / 75),
      fontWeight: "700",
      align: "center",
    },
  });

  text.anchor.set(0.5, 0.5);
  text.x = innerX + (innerWidth / 2);
  text.y = innerY + topSectionHeight + (bottomSectionHeight / 2);

  container.addChild(graphics);
  container.addChild(text);

  return container;
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

function drawCardProgressOutline(graphics: Graphics, config: ProgressOutlineConfig): void {
  const value = Math.max(0, Math.min(1, config.value));

  graphics
    .roundRect(config.x, config.y, config.width, config.height, config.radius)
    .stroke({ color: config.emptyColor, width: config.strokeWidth, alpha: 1 });

  if (value <= 0) {
    return;
  }

  const perimeter = 2 * (config.width + config.height);
  const filledLength = perimeter * value;
  const progressPath = buildPerimeterProgressPath(
    config.x,
    config.y,
    config.width,
    config.height,
    filledLength,
    config.direction,
  );

  if (progressPath.length < 2) {
    return;
  }

  graphics.moveTo(progressPath[0].x, progressPath[0].y);

  for (let index = 1; index < progressPath.length; index += 1) {
    const point = progressPath[index];
    graphics.lineTo(point.x, point.y);
  }

  graphics.stroke({ color: config.fillColor, width: config.strokeWidth, alpha: 1 });
}

function buildPerimeterProgressPath(
  x: number,
  y: number,
  width: number,
  height: number,
  filledLength: number,
  direction: ProgressDirection,
): Point[] {
  if (filledLength <= 0) {
    return [];
  }

  const segments =
    direction === "clockwise"
      ? [
          { dx: width, dy: 0 },
          { dx: 0, dy: height },
          { dx: -width, dy: 0 },
          { dx: 0, dy: -height },
        ]
      : [
          { dx: 0, dy: height },
          { dx: width, dy: 0 },
          { dx: 0, dy: -height },
          { dx: -width, dy: 0 },
        ];

  const path: Point[] = [{ x, y }];
  let currentPoint: Point = { x, y };
  let remaining = filledLength;

  for (const segment of segments) {
    if (remaining <= 0) {
      break;
    }

    const segmentLength = Math.abs(segment.dx) + Math.abs(segment.dy);
    const drawLength = Math.min(segmentLength, remaining);
    const ratio = segmentLength > 0 ? drawLength / segmentLength : 0;

    currentPoint = {
      x: currentPoint.x + (segment.dx * ratio),
      y: currentPoint.y + (segment.dy * ratio),
    };

    path.push({ ...currentPoint });
    remaining -= drawLength;
  }

  return path;
}
