import { Container, Graphics, Text } from "pixi.js";

import {
  buildHexPerimeterProgressPath,
  buildPointyTopHexVertices,
  computeInsetHexSize,
  drawClosedPolygonPath,
  type HexProgressDirection,
} from "./geometry";

export interface HexCard {
  id: string;
  type: number;
  name: string;
  colors: number[];
  progress: number;
  progressDirection: HexProgressDirection;
  progressFillColor: number;
  progressEmptyColor: number;
}

export interface HexCardViewConfig {
  centerX: number;
  centerY: number;
  size: number;
  screenHeight: number;
  strokeColor?: number;
}

export function isHexCardType(cardType: number): boolean {
  return cardType >= 6 && cardType <= 8;
}

export function createHexCardView(card: HexCard, config: HexCardViewConfig): Container {
  const container = new Container();
  const backgroundLayer = new Graphics();
  const progressLayer = new Graphics();
  const spriteLayer = new Container();
  const labelLayer = new Container();

  const strokeWidth = Math.max(1, 2 * (config.screenHeight / 240));
  const progressStrokeWidth = Math.max(1, strokeWidth * 0.5);

  const hexPathInset = strokeWidth / 2;
  const pathSize = computeInsetHexSize(config.size, strokeWidth);
  const pathVertices = buildPointyTopHexVertices(config.centerX, config.centerY, pathSize);

  drawClosedPolygonPath(backgroundLayer, pathVertices);
  backgroundLayer
    .fill({ color: card.colors[0] ?? 0xd3deef, alpha: 1 })
    .stroke({ color: config.strokeColor ?? 0xd3deef, width: strokeWidth, alpha: 1 });

  drawHexProgress(progressLayer, {
    centerX: config.centerX,
    centerY: config.centerY,
    size: config.size,
    inset: hexPathInset,
    value: card.progress,
    direction: card.progressDirection,
    strokeWidth: progressStrokeWidth,
    fillColor: card.progressFillColor,
    emptyColor: card.progressEmptyColor,
  });

  const label = new Text({
    text: card.name,
    style: {
      fontFamily: "Arial",
      fontSize: Math.max(10, config.screenHeight / 75),
      fontWeight: "700",
      align: "center",
      wordWrap: true,
      wordWrapWidth: 2 * pathSize * 0.75,
      breakWords: true,
    },
  });
  label.style.fill = normalizeTextColor(card.colors?.[2], 0x0b1a2a);

  label.anchor.set(0.5, 0.5);
  label.x = config.centerX;
  label.y = config.centerY;

  const labelClipMask = new Graphics();
  drawClosedPolygonPath(labelClipMask, pathVertices);
  labelClipMask.fill({ color: 0xffffff, alpha: 1 });

  labelLayer.addChild(labelClipMask);
  labelLayer.addChild(label);
  label.mask = labelClipMask;

  container.addChild(backgroundLayer);
  container.addChild(spriteLayer);
  container.addChild(progressLayer);
  container.addChild(labelLayer);

  container.label = `hex-card:${card.id}`;
  spriteLayer.label = `hex-card-sprite-layer:${card.id}`;

  return container;
}

function normalizeTextColor(rawColor: number | string | undefined, fallback: number): number {
  if (typeof rawColor === "number") {
    return rawColor;
  }

  if (typeof rawColor !== "string") {
    return fallback;
  }

  const normalized = rawColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  return Number.parseInt(normalized, 16);
}

interface DrawHexProgressConfig {
  centerX: number;
  centerY: number;
  size: number;
  inset: number;
  value: number;
  direction: HexProgressDirection;
  strokeWidth: number;
  fillColor: number;
  emptyColor: number;
}

function drawHexProgress(graphics: Graphics, config: DrawHexProgressConfig): void {
  const outlineVertices = buildPointyTopHexVertices(config.centerX, config.centerY, config.size, config.inset);

  drawClosedPolygonPath(graphics, outlineVertices);
  graphics.stroke({ color: config.emptyColor, width: config.strokeWidth, alpha: 1 });

  const progressPath = buildHexPerimeterProgressPath({
    centerX: config.centerX,
    centerY: config.centerY,
    size: config.size,
    inset: config.inset,
    value: config.value,
    direction: config.direction,
  });

  if (progressPath.length < 2) {
    return;
  }

  graphics.moveTo(progressPath[0].x, progressPath[0].y);

  for (let pointIndex = 1; pointIndex < progressPath.length; pointIndex += 1) {
    const point = progressPath[pointIndex];
    graphics.lineTo(point.x, point.y);
  }

  graphics.stroke({ color: config.fillColor, width: config.strokeWidth, alpha: 1 });
}
