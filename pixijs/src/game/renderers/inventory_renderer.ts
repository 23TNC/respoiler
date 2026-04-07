import { Container, Graphics, Text } from "pixi.js";
import { CardView } from "../components/card_view";
import type { CardCategory, EntityId, TrackedCard } from "../model";

const CATEGORY_TITLES: Record<CardCategory, string> = {
  action: "Discipline",
  skill: "Faculty",
  item: "Requisites",
  memory: "Reveries",
  soul: "Souls",
};

type InventoryRenderParams = {
  inventories: Record<CardCategory, TrackedCard[]>;
  selectedCardId?: EntityId;
  width: number;
  onSelect: (cardId: EntityId) => void;
  onDragStart: (cardId: EntityId) => void;
  onDragMove: (cardId: EntityId, x: number, y: number) => void;
  onDragEnd: (cardId: EntityId, x: number, y: number) => void;
};

export class InventoryRenderer {
  readonly container = new Container();

  render(params: InventoryRenderParams): void {
    this.container.removeChildren();

    const categories: CardCategory[] = ["action", "skill", "item", "memory", "soul"];
    const sectionWidth = params.width / categories.length;

    categories.forEach((category, index) => {
      const section = new Container();
      section.position.set(index * sectionWidth, 0);

      const bg = new Graphics();
      bg.roundRect(0, 0, sectionWidth - 8, 170, 6).fill(0x1e1e1e);
      bg.roundRect(0, 0, sectionWidth - 8, 170, 6).stroke({ color: 0x444444, width: 1 });

      const title = new Text({
        text: CATEGORY_TITLES[category],
        style: { fill: 0xe8e8e8, fontSize: 13, fontWeight: "bold" },
      });
      title.position.set(8, 6);

      section.addChild(bg, title);

      const cards = params.inventories[category];
      cards.forEach((trackedCard, cardIndex) => {
        const cardView = new CardView({
          trackedCard,
          width: sectionWidth - 20,
          height: 52,
          selected: params.selectedCardId === trackedCard.card.cardId,
          onSelect: params.onSelect,
          onDragStart: params.onDragStart,
          onDragMove: params.onDragMove,
          onDragEnd: params.onDragEnd,
        });
        cardView.position.set(6, 30 + cardIndex * 56);
        section.addChild(cardView);
      });

      this.container.addChild(section);
    });
  }
}
