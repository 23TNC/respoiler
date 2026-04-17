import type { LayoutRect } from "./layout";

export interface CardLayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface InventoryCardMetrics {
  cardWidth: number;
  cardHeight: number;
  panelPadding: number;
  scrollBarWidth: number;
}

export function computeInventoryCardMetrics(
  screenWidth: number,
  screenHeight: number,
): InventoryCardMetrics {
  const panelWidth = (48 / 240) * screenWidth;
  const padding = screenHeight / 240;
  const scrollBarWidth = 4 * padding;
  const cardWidth = (panelWidth - (2 * padding) - scrollBarWidth) / 5;
  const cardHeight = (8 / 5) * cardWidth;

  return {
    cardWidth,
    cardHeight,
    panelPadding: padding,
    scrollBarWidth,
  };
}

export function computeInventoryCardLayoutRects(
  panelRect: LayoutRect,
  cardCount: number,
  screenWidth: number,
  screenHeight: number,
): CardLayoutRect[] {
  const { cardWidth, cardHeight, panelPadding, scrollBarWidth } = computeInventoryCardMetrics(
    screenWidth,
    screenHeight,
  );

  const columns = 5;
  const rowGap = panelPadding;

  const innerX = panelRect.x + panelPadding;
  const innerY = panelRect.y + panelPadding;
  const contentWidth = Math.max(0, panelRect.width - (2 * panelPadding) - scrollBarWidth);
  const cardStepX = contentWidth / columns;

  const layoutRects: CardLayoutRect[] = [];

  for (let index = 0; index < cardCount; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);

    layoutRects.push({
      x: innerX + (column * cardStepX),
      y: innerY + (row * (cardHeight + rowGap)),
      width: cardWidth,
      height: cardHeight,
    });
  }

  return layoutRects;
}
