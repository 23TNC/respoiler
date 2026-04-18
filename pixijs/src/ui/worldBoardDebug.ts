import { Container } from "pixi.js";

import { createHexCardView, isHexCardType } from "./hexCardRenderer";
import { worldHexToPanelPixel } from "./hexGrid";
import { computeHexTileSize } from "./hexLayout";
import type { LayoutRect } from "./layout";
import { getDebugWorldHexTiles } from "./debugHexTiles";

export function drawWorldBoardDebugTiles(
  worldLayer: Container,
  worldPanelRect: LayoutRect,
  screenHeight: number,
): void {
  const hexSize = computeHexTileSize(screenHeight);
  const worldOrigin = {
    x: worldPanelRect.x + (worldPanelRect.width / 2),
    y: worldPanelRect.y + (worldPanelRect.height / 2),
  };

  const debugTiles = getDebugWorldHexTiles();

  for (const tile of debugTiles) {
    if (!isHexCardType(tile.card.type)) {
      continue;
    }

    const pixel = worldHexToPanelPixel(tile.world, hexSize, worldOrigin);
    const hexCard = createHexCardView(tile.card, {
      centerX: pixel.x,
      centerY: pixel.y,
      size: hexSize,
      screenHeight,
    });

    worldLayer.addChild(hexCard);
  }
}
