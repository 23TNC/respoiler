import { Container, Graphics, Rectangle, Text } from "pixi.js";
import type { EntityId, TrackedCard } from "../model";
import { CARD_ART_REGION_RATIO, CARD_NAME_REGION_RATIO, UI_LAYOUT } from "../ui_layout";

export type CardViewConfig = {
  trackedCard: TrackedCard;
  width: number;
  height: number;
  selected?: boolean;
  onSelect?: (cardId: EntityId) => void;
  onDragStart?: (cardId: EntityId) => void;
  onDragMove?: (cardId: EntityId, x: number, y: number) => void;
  onDragEnd?: (cardId: EntityId, x: number, y: number) => void;
};

export class CardView extends Container {
  private readonly background: Graphics;
  private readonly artRegionBackground: Graphics;
  private readonly outline: Graphics;
  private readonly titleText: Text;
  private readonly trackedCard: TrackedCard;
  private dragging = false;

  constructor(config: CardViewConfig) {
    super();

    this.trackedCard = config.trackedCard;
    this.background = new Graphics();
    this.artRegionBackground = new Graphics();
    this.outline = new Graphics();
    this.titleText = new Text({
      text: config.trackedCard.definition?.title ?? `Card ${config.trackedCard.card.cardId}`,
      style: {
        fill: 0x101010,
        fontSize: 12,
        align: "center",
        wordWrap: true,
        wordWrapWidth: config.width - UI_LAYOUT.card.textPadding * 2,
      },
    });
    this.titleText.anchor.set(0.5);

    this.addChild(this.background, this.artRegionBackground, this.outline, this.titleText);

    this.draw(config.width, config.height, Boolean(config.selected));

    this.eventMode = "static";
    this.cursor = "pointer";
    this.hitArea = new Rectangle(0, 0, config.width, config.height);

    this.on("pointertap", () => config.onSelect?.(this.trackedCard.card.cardId));
    this.on("pointerdown", () => {
      this.dragging = true;
      config.onDragStart?.(this.trackedCard.card.cardId);
    });
    this.on("globalpointermove", (event) => {
      if (!this.dragging) {
        return;
      }
      config.onDragMove?.(this.trackedCard.card.cardId, event.global.x, event.global.y);
    });
    this.on("pointerup", (event) => {
      if (!this.dragging) {
        return;
      }
      this.dragging = false;
      config.onDragEnd?.(this.trackedCard.card.cardId, event.global.x, event.global.y);
    });
    this.on("pointerupoutside", (event) => {
      if (!this.dragging) {
        return;
      }
      this.dragging = false;
      config.onDragEnd?.(this.trackedCard.card.cardId, event.global.x, event.global.y);
    });
  }

  setSelected(selected: boolean, width: number, height: number): void {
    this.draw(width, height, selected);
  }

  private draw(width: number, height: number, selected: boolean): void {
    const isAction = this.trackedCard.card.cardType === "action";
    const fillColor = isAction ? 0xc9b7ff : 0xf0f0f0;
    const artRegionHeight = height * CARD_ART_REGION_RATIO;
    const nameRegionHeight = height * CARD_NAME_REGION_RATIO;

    this.background.clear();
    this.background.roundRect(0, 0, width, height, UI_LAYOUT.card.cornerRadius).fill(fillColor);

    this.artRegionBackground.clear();
    this.artRegionBackground
      .roundRect(0, 0, width, artRegionHeight, UI_LAYOUT.card.cornerRadius)
      .fill({ color: 0xffffff, alpha: 0.14 });
    this.artRegionBackground
      .moveTo(UI_LAYOUT.card.cornerRadius * 0.5, artRegionHeight)
      .lineTo(width - UI_LAYOUT.card.cornerRadius * 0.5, artRegionHeight)
      .stroke({ color: 0x212121, alpha: 0.2, width: 1 });

    this.outline.clear();
    this.outline.roundRect(0, 0, width, height, UI_LAYOUT.card.cornerRadius).stroke({
      color: selected ? 0xff9f1c : 0x3a3a3a,
      width: selected ? 3 : 1,
    });

    this.titleText.style.wordWrapWidth = width - UI_LAYOUT.card.textPadding * 2;
    this.titleText.position.set(width * 0.5, artRegionHeight + nameRegionHeight * 0.5);

    if (this.trackedCard.tracker?.positionLock) {
      this.alpha = 0.75;
    } else if (this.trackedCard.tracker?.positionHold) {
      this.alpha = 0.88;
    } else {
      this.alpha = 1;
    }
  }
}
