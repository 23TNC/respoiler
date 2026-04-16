import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { CardView } from "../components/card_view";
import type { CardCategory, EntityId, TrackedCard } from "../model";
import { CARD_HEIGHT, UI_LAYOUT } from "../ui_layout";

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
  height: number;
  onSelect: (cardId: EntityId) => void;
  // Coordinates are Pixi renderer-global pointer coordinates (event.global).
  onDragStart: (cardId: EntityId, globalX: number, globalY: number) => void;
  // Coordinates are Pixi renderer-global pointer coordinates (event.global).
  onDragMove: (cardId: EntityId, globalX: number, globalY: number) => void;
  // Coordinates are Pixi renderer-global pointer coordinates (event.global).
  onDragEnd: (cardId: EntityId, globalX: number, globalY: number) => void;
};

type InventoryPanelMetrics = {
  contentWidth: number;
  contentHeight: number;
  cardWidth: number;
  cardHeight: number;
  columns: number;
  totalRows: number;
  totalContentHeight: number;
  maxScroll: number;
};

export class InventoryRenderer {
  readonly container = new Container();
  private readonly scrollOffsets: Partial<Record<CardCategory, number>> = {};

  render(params: InventoryRenderParams): void {
    this.container.removeChildren();

    const categories: CardCategory[] = ["action", "skill", "item", "memory", "soul"];
    const sectionWidth =
      (params.width - UI_LAYOUT.inventory.sectionGap * (categories.length - 1)) / categories.length;
    const sectionHeight = Math.max(80, params.height);
    const contentTop = UI_LAYOUT.inventory.headerHeight + UI_LAYOUT.inventory.contentTopGap;
    const contentHeight = Math.max(
      24,
      sectionHeight - contentTop - UI_LAYOUT.inventory.sectionBottomPadding,
    );

    categories.forEach((category, index) => {
      const cards = params.inventories[category];
      const section = new Container();
      section.position.set(index * (sectionWidth + UI_LAYOUT.inventory.sectionGap), 0);
      section.eventMode = "static";
      section.hitArea = new Rectangle(0, 0, sectionWidth, sectionHeight);

      const bg = new Graphics();
      bg.roundRect(0, 0, sectionWidth, sectionHeight, 6).fill(0x1e1e1e);
      bg.roundRect(0, 0, sectionWidth, sectionHeight, 6).stroke({ color: 0x444444, width: 1 });

      const title = new Text({
        text: CATEGORY_TITLES[category],
        style: { fill: 0xe8e8e8, fontSize: 13, fontWeight: "bold" },
      });
      title.position.set(UI_LAYOUT.inventory.panelPadding, 6);

      const metrics = this.computeMetrics(cards.length, sectionWidth, contentHeight);
      const contentViewport = new Container();
      contentViewport.position.set(UI_LAYOUT.inventory.panelPadding, contentTop);

      const content = new Container();
      const mask = new Graphics()
        .rect(0, 0, metrics.contentWidth, metrics.contentHeight)
        .fill(0xffffff);
      contentViewport.mask = mask;

      const clampedOffset = this.clampScroll(category, metrics.maxScroll);
      content.y = -clampedOffset;

      cards.forEach((trackedCard, cardIndex) => {
        const column = cardIndex % metrics.columns;
        const row = Math.floor(cardIndex / metrics.columns);
        const cardX = column * (metrics.cardWidth + UI_LAYOUT.inventory.cardGap);
        const cardY = row * (metrics.cardHeight + UI_LAYOUT.inventory.cardGap);

        const cardView = new CardView({
          trackedCard,
          width: metrics.cardWidth,
          height: metrics.cardHeight,
          selected: params.selectedCardId === trackedCard.card.cardId,
          onSelect: () => params.onSelect(trackedCard.card.cardId),
          onDragStart: (_cardId, globalX, globalY) =>
            params.onDragStart(trackedCard.card.cardId, globalX, globalY),
          onDragMove: (_cardId, globalX, globalY) =>
            params.onDragMove(trackedCard.card.cardId, globalX, globalY),
          onDragEnd: (_cardId, globalX, globalY) =>
            params.onDragEnd(trackedCard.card.cardId, globalX, globalY),
        });
        cardView.position.set(cardX, cardY);
        content.addChild(cardView);
      });

      const scrollbarTrack = new Graphics();
      const scrollbarThumb = new Graphics();
      this.drawScrollbar(
        scrollbarTrack,
        scrollbarThumb,
        sectionWidth,
        contentTop,
        contentHeight,
        metrics,
        clampedOffset,
      );

      section.on("wheel", (event) => {
        if (metrics.maxScroll <= 0) {
          return;
        }
        event.preventDefault();
        const deltaY = event.deltaY;
        const nextOffset = Math.max(0, Math.min(metrics.maxScroll, this.getScroll(category) + deltaY));
        this.scrollOffsets[category] = nextOffset;
        content.y = -nextOffset;
        this.drawScrollbar(
          scrollbarTrack,
          scrollbarThumb,
          sectionWidth,
          contentTop,
          contentHeight,
          metrics,
          nextOffset,
        );
      });

      contentViewport.addChild(content, mask);
      section.addChild(bg, title, contentViewport, scrollbarTrack, scrollbarThumb);
      this.container.addChild(section);
    });
  }

  private computeMetrics(cardCount: number, sectionWidth: number, contentHeight: number): InventoryPanelMetrics {
    const contentWidth =
      sectionWidth -
      UI_LAYOUT.inventory.panelPadding * 2 -
      UI_LAYOUT.inventory.scrollbarGap -
      UI_LAYOUT.inventory.scrollbarWidth;
    const cardWidth = Math.min(UI_LAYOUT.card.width, Math.max(42, contentWidth));
    const cardHeight = CARD_HEIGHT(cardWidth);
    const columns = Math.max(
      1,
      Math.floor((contentWidth + UI_LAYOUT.inventory.cardGap) / (cardWidth + UI_LAYOUT.inventory.cardGap)),
    );
    const totalRows = Math.max(1, Math.ceil(cardCount / columns));
    const totalContentHeight =
      totalRows * cardHeight + Math.max(0, totalRows - 1) * UI_LAYOUT.inventory.cardGap;

    return {
      contentWidth,
      contentHeight,
      cardWidth,
      cardHeight,
      columns,
      totalRows,
      totalContentHeight,
      maxScroll: Math.max(0, totalContentHeight - contentHeight),
    };
  }

  private drawScrollbar(
    track: Graphics,
    thumb: Graphics,
    sectionWidth: number,
    contentTop: number,
    contentHeight: number,
    metrics: InventoryPanelMetrics,
    scrollOffset: number,
  ): void {
    const trackX = sectionWidth - UI_LAYOUT.inventory.panelPadding - UI_LAYOUT.inventory.scrollbarWidth;

    track.clear();
    track
      .roundRect(trackX, contentTop, UI_LAYOUT.inventory.scrollbarWidth, contentHeight, 4)
      .fill(0x292929);

    thumb.clear();
    if (metrics.maxScroll <= 0) {
      thumb
        .roundRect(trackX, contentTop, UI_LAYOUT.inventory.scrollbarWidth, contentHeight, 4)
        .fill({ color: 0x5a5a5a, alpha: 0.55 });
      return;
    }

    const visibleRatio = metrics.contentHeight / metrics.totalContentHeight;
    const thumbHeight = Math.max(
      UI_LAYOUT.inventory.scrollbarMinThumbHeight,
      Math.floor(contentHeight * visibleRatio),
    );
    const thumbTravel = contentHeight - thumbHeight;
    const thumbY = contentTop + (scrollOffset / metrics.maxScroll) * thumbTravel;

    thumb
      .roundRect(trackX, thumbY, UI_LAYOUT.inventory.scrollbarWidth, thumbHeight, 4)
      .fill(0x8f8f8f);
  }

  private getScroll(category: CardCategory): number {
    return this.scrollOffsets[category] ?? 0;
  }

  private clampScroll(category: CardCategory, maxScroll: number): number {
    const clamped = Math.max(0, Math.min(maxScroll, this.getScroll(category)));
    this.scrollOffsets[category] = clamped;
    return clamped;
  }
}
