import { Graphics } from "pixi.js";

import type { LayoutRect } from "./layout";

const PANEL_FILL = 0x172233;
const PANEL_STROKE = 0x8da6c6;

export function drawPanel(graphics: Graphics, layoutRect: LayoutRect, padding: number): void {
  const innerX = layoutRect.x + padding;
  const innerY = layoutRect.y + padding;
  const innerWidth = Math.max(0, layoutRect.width - 2 * padding);
  const innerHeight = Math.max(0, layoutRect.height - 2 * padding);
  const cornerRadius = Math.max(0, padding * 2);

  graphics
    .roundRect(innerX, innerY, innerWidth, innerHeight, cornerRadius)
    .fill({ color: PANEL_FILL, alpha: 0.9 })
    .stroke({ color: PANEL_STROKE, alpha: 1, width: Math.max(1, padding * 0.5) });
}
