import { Graphics } from 'pixi.js';

import type { LayoutRect } from '../layout/panelLayout';

export const drawInsetPanel = (
  graphics: Graphics,
  rect: LayoutRect,
  padding: number,
  cornerRadius: number
): void => {
  const innerX = rect.x + padding;
  const innerY = rect.y + padding;
  const innerWidth = rect.width - (2 * padding);
  const innerHeight = rect.height - (2 * padding);

  if (innerWidth <= 0 || innerHeight <= 0) {
    graphics.clear();
    return;
  }

  graphics.clear();
  graphics
    .roundRect(innerX, innerY, innerWidth, innerHeight, cornerRadius)
    .fill({ color: 0x1f2430, alpha: 0.95 })
    .stroke({ color: 0x90a4ae, width: 1.5, alpha: 1 });
};
