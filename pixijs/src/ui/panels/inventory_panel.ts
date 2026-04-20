import { type ClientCard, client_cards, viewed_id } from "../../spacetime/data";
import { computeInventoryCardLayoutRects } from "../rectangle/card_layout";
import { createRectangleCardView } from "../rectangle/card_renderer";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

export class InventoryPanel extends Panel {
  private readonly cardType: number;

  constructor(layoutRect: LayoutRect, panelPadding: number, cardType: number) {
    super(layoutRect, panelPadding);
    this.cardType = cardType;
  }

  override refresh(screenWidth: number, screenHeight: number): void {
    this.removeChildren();

    const cards = Object.values(client_cards)
      .filter((card) => (
        card.zone === 0
        && card.card_type === this.cardType
        && card.link === viewed_id
      ))
      .sort((a, b) => a.card_id - b.card_id);

    if (cards.length === 0) {
      return;
    }

    const layoutRects = computeInventoryCardLayoutRects(this.getLayoutRect(), cards.length, screenWidth, screenHeight);
    const cardPadding = screenHeight / 240;

    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      const layoutRect = layoutRects[index];

      if (!layoutRect) {
        continue;
      }

      this.drawCard(card, layoutRect, cardPadding, screenHeight);
    }
  }

  private removeChildren(): void {
    this.clearContent();
  }

  private drawCard(card: ClientCard, layoutRect: LayoutRect, cardPadding: number, screenHeight: number): void {
    const cardView = createRectangleCardView(
      {
        id: String(card.card_id),
        name: `#${card.card_id}`,
        colors: inventoryColorsForType(this.cardType),
        progress: 0,
        progressDirection: "clockwise",
        progressFillColor: 0xc9d8ed,
        progressEmptyColor: 0x2f4258,
      },
      layoutRect,
      cardPadding,
      screenHeight,
    );

    this.content.addChild(cardView);
  }
}

function inventoryColorsForType(cardType: number): [number, number, number] {
  const paletteByType: Record<number, [number, number, number]> = {
    1: [0x43617e, 0x2f4258, 0xf4f8ff],
    2: [0x465d77, 0x33465e, 0xf4f8ff],
    3: [0x4a5a71, 0x37485c, 0xf4f8ff],
    4: [0x4d576b, 0x3b4a59, 0xf4f8ff],
    5: [0x505465, 0x3f4c56, 0xf4f8ff],
  };

  return paletteByType[cardType] ?? [0x43617e, 0x2f4258, 0xf4f8ff];
}
