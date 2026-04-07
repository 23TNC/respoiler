import { Container, Graphics, Text } from "pixi.js";
import type { EntityId, TrackedCard } from "../model";

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
  private readonly outline: Graphics;
  private readonly label: Text;
  private readonly subLabel: Text;
  private readonly trackedCard: TrackedCard;
  private dragging = false;

  constructor(config: CardViewConfig) {
    super();

    this.trackedCard = config.trackedCard;
    this.background = new Graphics();
    this.outline = new Graphics();
    this.label = new Text({
      text: config.trackedCard.definition?.title ?? `Card ${config.trackedCard.card.cardId}`,
      style: { fill: 0x101010, fontSize: 12, wordWrap: true, wordWrapWidth: config.width - 12 },
    });
    this.subLabel = new Text({
      text: this.buildSubLabel(config.trackedCard),
      style: { fill: 0x2b2b2b, fontSize: 10 },
    });

    this.label.position.set(6, 6);
    this.subLabel.position.set(6, config.height - 18);

    this.addChild(this.background, this.outline, this.label, this.subLabel);

    this.draw(config.width, config.height, Boolean(config.selected));

    this.eventMode = "static";
    this.cursor = "pointer";

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

    this.background.clear();
    this.background.roundRect(0, 0, width, height, 8).fill(fillColor);

    this.outline.clear();
    this.outline.roundRect(0, 0, width, height, 8).stroke({
      color: selected ? 0xff9f1c : 0x3a3a3a,
      width: selected ? 3 : 1,
    });

    if (this.trackedCard.tracker?.positionLock) {
      this.alpha = 0.75;
    } else if (this.trackedCard.tracker?.positionHold) {
      this.alpha = 0.88;
    } else {
      this.alpha = 1;
    }
  }

  private buildSubLabel(trackedCard: TrackedCard): string {
    const hold = trackedCard.tracker?.positionHold ? "hold" : "free";
    const lock = trackedCard.tracker?.positionLock ? "lock" : "move";
    return `${trackedCard.card.cardType} • ${trackedCard.actionState} • ${hold}/${lock}`;
  }
}
