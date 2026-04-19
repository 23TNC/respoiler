import { Graphics } from "pixi.js";

import type { LayoutRect } from "./layout";

const PANEL_FILL = 0x172233;
const PANEL_STROKE = 0x8da6c6;

export interface PanelInnerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computePanelInnerRect(layoutRect: LayoutRect, padding: number): PanelInnerRect {
  return {
    x: layoutRect.x + padding,
    y: layoutRect.y + padding,
    width: Math.max(0, layoutRect.width - 2 * padding),
    height: Math.max(0, layoutRect.height - 2 * padding),
  };
}

export function drawPanel(graphics: Graphics, layoutRect: LayoutRect, padding: number): void {
  const { x: innerX, y: innerY, width: innerWidth, height: innerHeight } = computePanelInnerRect(layoutRect, padding);
  const cornerRadius = Math.max(0, padding * 2 );

  graphics
    .roundRect(innerX, innerY, innerWidth, innerHeight, cornerRadius)
    .fill({ color: PANEL_FILL, alpha: 0.9 })
    .stroke({ color: PANEL_STROKE, alpha: 1, width: Math.max(1, padding * 0.5) });
}
