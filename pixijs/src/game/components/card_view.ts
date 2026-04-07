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
  private readonly colorRegions: Container;
  private readonly roundedMask: Graphics;
  private readonly topRegion: Graphics;
  private readonly bottomRegion: Graphics;
  private readonly splitLine: Graphics;
  private readonly outline: Graphics;
  private readonly titleText: Text;
  private readonly trackedCard: TrackedCard;
  private dragging = false;

  constructor(config: CardViewConfig) {
    super();

    this.trackedCard = config.trackedCard;
    this.colorRegions = new Container();
    this.roundedMask = new Graphics();
    this.topRegion = new Graphics();
    this.bottomRegion = new Graphics();
    this.splitLine = new Graphics();
    this.outline = new Graphics();
    this.titleText = new Text({
      text: config.trackedCard.definition?.name ?? `Card ${config.trackedCard.card.cardId}`,
      style: {
        fill: 0x101010,
        fontSize: 12,
        align: "center",
        wordWrap: true,
        wordWrapWidth: config.width - UI_LAYOUT.card.textPadding * 2,
      },
    });
    this.titleText.anchor.set(0.5);

    this.colorRegions.addChild(this.topRegion, this.bottomRegion);
    this.colorRegions.mask = this.roundedMask;

    this.addChild(this.colorRegions, this.roundedMask, this.splitLine, this.outline, this.titleText);

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
    const fallbackTopColor = 0x6f7d88;
    const fallbackBottomColor = 0x3a4652;
    const topColor = this.trackedCard.definition?.topColor ?? fallbackTopColor;
    const bottomColor = this.trackedCard.definition?.bottomColor ?? fallbackBottomColor;

    const artRegionHeight = height * CARD_ART_REGION_RATIO;
    const nameRegionHeight = height * CARD_NAME_REGION_RATIO;

    this.roundedMask.clear();
    this.roundedMask.roundRect(0, 0, width, height, UI_LAYOUT.card.cornerRadius).fill(0xffffff);

    this.topRegion.clear();
    this.topRegion.rect(0, 0, width, artRegionHeight).fill(topColor);

    this.bottomRegion.clear();
    this.bottomRegion.rect(0, artRegionHeight, width, height - artRegionHeight).fill(bottomColor);

    this.splitLine.clear();
    this.splitLine
      .moveTo(UI_LAYOUT.card.cornerRadius * 0.5, artRegionHeight)
      .lineTo(width - UI_LAYOUT.card.cornerRadius * 0.5, artRegionHeight)
      .stroke({ color: 0x212121, alpha: 0.22, width: 1 });

    this.outline.clear();
    this.outline.roundRect(0, 0, width, height, UI_LAYOUT.card.cornerRadius).stroke({
      color: selected ? 0xff9f1c : 0x3a3a3a,
      width: selected ? 3 : 1,
    });

    this.titleText.text = this.trackedCard.definition?.name ?? `Card ${this.trackedCard.card.cardId}`;
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
