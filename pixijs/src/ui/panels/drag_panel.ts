import { Container } from "pixi.js";

import { type ClientCard, client_cards, getCardDefinition } from "../../spacetime/data";
import { computeInventoryCardMetrics } from "../rectangle/card_layout";
import { createRectangleCardView } from "../rectangle/card_renderer";

export class DragPanel {
  readonly root: Container;

  private pointerX = 0;
  private pointerY = 0;
  private cachedCardId: number | null = null;
  private cardContainer: Container | null = null;

  constructor() {
    this.root = new Container();
    this.root.label = "drag-panel";
    this.root.eventMode = "none";
  }

  setPointerPosition(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
  }

  refresh(screenWidth: number, screenHeight: number): void {
    const draggingCard = findDraggingCard();

    if (!draggingCard) {
      this.clearCard();
      return;
    }

    const { cardWidth, cardHeight } = computeInventoryCardMetrics(screenWidth, screenHeight);

    if (draggingCard.card_id !== this.cachedCardId || !this.cardContainer) {
      this.clearCard();
      this.cachedCardId = draggingCard.card_id;

      const definition = getCardDefinition(draggingCard.definition);
      const fallback = inventoryColorsForType(draggingCard.card_type);
      const cardPadding = screenHeight / 240;

      const cardView = createRectangleCardView(
        {
          id: String(draggingCard.card_id),
          type: draggingCard.card_type,
          name: definition?.name ?? `#${draggingCard.card_id}`,
          colors: [
            resolveStyleColor(definition, 0, fallback[0]),
            resolveStyleColor(definition, 1, fallback[1]),
            resolveStyleColor(definition, 2, fallback[2]),
          ],
          progress: 0,
          progressDirection: "clockwise",
          progressFillColor: 0xc9d8ed,
          progressEmptyColor: 0x2f4258,
        },
        { x: 0, y: 0, width: cardWidth, height: cardHeight },
        cardPadding,
        screenHeight,
      );

      this.cardContainer = cardView;
      this.root.addChild(this.cardContainer);
    }

    this.cardContainer.x = Math.round(this.pointerX - cardWidth / 2);
    this.cardContainer.y = Math.round(this.pointerY - cardHeight / 2);
  }

  private clearCard(): void {
    if (this.cardContainer) {
      this.root.removeChild(this.cardContainer);
      this.cardContainer.destroy({ children: true });
      this.cardContainer = null;
    }
    this.cachedCardId = null;
  }
}

function findDraggingCard(): ClientCard | null {
  for (const key in client_cards) {
    const card = client_cards[Number(key)];
    if (card?.dragging) {
      return card;
    }
  }
  return null;
}

function inventoryColorsForType(cardType: number): [number, number, number] {
  const paletteByType: Record<number, [number, number, number]> = {
    1: [0x43617e, 0x2f4258, 0x0b1a2a],
    2: [0x465d77, 0x33465e, 0x0b1a2a],
    3: [0x4a5a71, 0x37485c, 0x0b1a2a],
    4: [0x4d576b, 0x3b4a59, 0x0b1a2a],
    5: [0x505465, 0x3f4c56, 0x0b1a2a],
  };
  return paletteByType[cardType] ?? [0x43617e, 0x2f4258, 0x0b1a2a];
}

function resolveStyleColor(
  definition: { style?: { color?: Array<number | string> } } | undefined,
  index: number,
  fallback: number,
): number {
  const rawColor = definition?.style?.color?.[index];
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
