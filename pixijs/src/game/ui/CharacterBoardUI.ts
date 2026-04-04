import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CharacterInventory, SoulModel } from '../characters/types';
import { INVENTORY_GROUP_ORDER } from '../characters/types';
import { CARD_GROUP_LABEL, type CardDefinition, type CardGroup, type CardInstanceState } from '../cards/types';
import type { DragCardPayload } from './dragTypes';
import { CARD_HEIGHT, CARD_WIDTH, pointInRoundedRect, renderCardTag } from './cardVisual';

interface InventoryCardVisual {
  bounds: Rectangle;
  payload: DragCardPayload;
  group: CardGroup;
}

interface GroupPanelLayout {
  group: CardGroup;
  x: number;
  y: number;
  width: number;
  height: number;
}

const HEADER_HEIGHT = 28;
const PANEL_WIDTH = 172;
const PANEL_HEIGHT = 126;
const VIEWPORT_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT - 10;
const PANEL_GAP = 10;
const ROOT_PADDING = 10;
const CARD_GAP_X = 8;
const CARD_GAP_Y = 8;
const SCROLLBAR_WIDTH = 5;

export class CharacterBoardUI {
  readonly root = new Container();

  private readonly cardVisuals: InventoryCardVisual[] = [];

  private readonly scrollOffsetByGroup: Record<CardGroup, number> = {
    techniques: 0,
    essence: 0,
    sundries: 0,
    reveries: 0,
    souls: 0,
  };

  private readonly contentHeightByGroup: Record<CardGroup, number> = {
    techniques: 0,
    essence: 0,
    sundries: 0,
    reveries: 0,
    souls: 0,
  };

  private readonly layouts: GroupPanelLayout[] = [];

  private viewedSoulCardVisual: InventoryCardVisual | null = null;

  private returnToPlayerBounds: Rectangle | null = null;

  constructor(
    private readonly cardsById: Map<string, CardDefinition>,
    private readonly getCardState: (instanceId: string) => CardInstanceState,
    private readonly getViewedSoul: () => SoulModel | undefined,
    private readonly getViewedInventory: () => CharacterInventory | undefined,
    private readonly shouldShowReturnToPlayer: () => boolean,
  ) {}

  render(): void {
    this.root.removeChildren();
    this.cardVisuals.length = 0;
    this.layouts.length = 0;
    this.returnToPlayerBounds = null;
    this.viewedSoulCardVisual = null;

    const viewedSoul = this.getViewedSoul();
    if (!viewedSoul) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;

    const board = new Graphics();
    board.roundRect(0, 0, this.boardWidth(), this.boardHeight(), 12).fill({ color: 0x0b1320, alpha: 0.85 }).stroke({
      color: 0x2d4772,
      width: 2,
    });
    this.root.addChild(board);

    const viewedSoulCard: CardDefinition = {
      id: viewedSoul.soulId,
      name: viewedSoul.name,
      group: 'souls',
      backgroundColor: 0xa8e0e6,
    };
    const viewedSoulCardBounds = renderCardTag(this.root, { x: 12, y: 6, card: viewedSoulCard, width: 180, height: 24 });
    this.viewedSoulCardVisual = {
      bounds: viewedSoulCardBounds,
      payload: {
        card: viewedSoulCard,
        instance: {
          instanceId: `viewed-soul-${viewedSoul.soulId}`,
          cardId: viewedSoul.soulId,
          soulId: viewedSoul.soulId,
        },
      },
      group: 'souls',
    };

    const identityLabel = new Text({
      text: 'Viewed Soul',
      style: { fill: '#dce9ff', fontSize: 11, fontWeight: '700' },
    });
    identityLabel.position.set(198, 11);
    this.root.addChild(identityLabel);

    if (this.shouldShowReturnToPlayer()) {
      this.returnToPlayerBounds = new Rectangle(290, 6, 140, 24);
      const returnButton = new Graphics();
      returnButton.roundRect(
        this.returnToPlayerBounds.x,
        this.returnToPlayerBounds.y,
        this.returnToPlayerBounds.width,
        this.returnToPlayerBounds.height,
        6,
      ).fill({ color: 0x345b92, alpha: 1 }).stroke({ color: 0x90b9ff, width: 1.5 });
      this.root.addChild(returnButton);

      const returnLabel = new Text({
        text: 'Return to Player',
        style: { fill: '#eaf2ff', fontSize: 11, fontWeight: '700' },
      });
      returnLabel.position.set(this.returnToPlayerBounds.x + 14, this.returnToPlayerBounds.y + 5);
      this.root.addChild(returnLabel);
    }

    const rowY = 32;
    for (let i = 0; i < INVENTORY_GROUP_ORDER.length; i += 1) {
      const group = INVENTORY_GROUP_ORDER[i];
      const x = ROOT_PADDING + i * (PANEL_WIDTH + PANEL_GAP);

      const layout: GroupPanelLayout = {
        group,
        x,
        y: rowY,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
      };
      this.layouts.push(layout);
      this.renderGroupPanel(layout);
    }
  }

  private renderGroupPanel(layout: GroupPanelLayout): void {
    const { group, x, y, width, height } = layout;

    const panel = new Graphics();
    panel.roundRect(x, y, width, height, 10).fill({ color: 0x10213a, alpha: 0.96 }).stroke({
      color: 0x446ba6,
      width: 2,
    });
    this.root.addChild(panel);

    const label = new Text({
      text: CARD_GROUP_LABEL[group],
      style: { fill: '#8cb4ff', fontSize: 12, fontWeight: '700' },
    });
    label.position.set(x + 10, y + 7);
    this.root.addChild(label);

    const content = new Container();
    this.root.addChild(content);

    const mask = new Graphics();
    mask.rect(x + 6, y + HEADER_HEIGHT, width - 12, VIEWPORT_HEIGHT).fill({ color: 0xffffff, alpha: 1 });
    this.root.addChild(mask);
    content.mask = mask;

    const list = this.getViewedInventory()?.[group] ?? [];
    const innerX = x + 8;
    const innerY = y + HEADER_HEIGHT + 4;
    const contentWidth = width - 18;
    const cardsPerRow = Math.max(1, Math.floor((contentWidth + CARD_GAP_X) / (CARD_WIDTH + CARD_GAP_X)));
    const rowWidth = cardsPerRow * CARD_WIDTH + (cardsPerRow - 1) * CARD_GAP_X;
    const startX = innerX + Math.max(0, (contentWidth - rowWidth) * 0.5);
    let itemIndex = 0;

    for (const instance of list) {
      if (this.getCardState(instance.instanceId) !== 'in_inventory') {
        continue;
      }

      const card = this.cardsById.get(instance.cardId);
      if (!card) {
        continue;
      }

      const col = itemIndex % cardsPerRow;
      const row = Math.floor(itemIndex / cardsPerRow);
      const cardX = startX + col * (CARD_WIDTH + CARD_GAP_X);
      const cardY = innerY + row * (CARD_HEIGHT + CARD_GAP_Y);
      const bounds = renderCardTag(content, { x: cardX, y: cardY, card });

      this.cardVisuals.push({
        bounds,
        payload: { card, instance },
        group,
      });
      itemIndex += 1;
    }

    const rowCount = itemIndex === 0 ? 0 : Math.ceil(itemIndex / cardsPerRow);
    this.contentHeightByGroup[group] = rowCount * CARD_HEIGHT + Math.max(0, rowCount - 1) * CARD_GAP_Y + 8;
    this.clampScroll(group);

    const scrollOffset = this.scrollOffsetByGroup[group];
    content.position.set(0, -scrollOffset);

    this.renderScrollbar(layout);
  }

  handleWheel(globalX: number, globalY: number, deltaY: number): boolean {
    for (const layout of this.layouts) {
      const panelBounds = new Rectangle(this.root.position.x + layout.x, this.root.position.y + layout.y, layout.width, layout.height);
      if (!panelBounds.contains(globalX, globalY)) {
        continue;
      }

      this.scrollOffsetByGroup[layout.group] += deltaY;
      this.clampScroll(layout.group);
      this.render();
      return true;
    }

    return false;
  }

  cardAtPoint(globalX: number, globalY: number): DragCardPayload | null {
    if (this.viewedSoulCardVisual) {
      const viewedSoulBounds = new Rectangle(
        this.root.position.x + this.viewedSoulCardVisual.bounds.x,
        this.root.position.y + this.viewedSoulCardVisual.bounds.y,
        this.viewedSoulCardVisual.bounds.width,
        this.viewedSoulCardVisual.bounds.height,
      );
      if (pointInRoundedRect(globalX, globalY, viewedSoulBounds)) {
        return this.viewedSoulCardVisual.payload;
      }
    }

    for (const visual of this.cardVisuals) {
      const layout = this.layouts.find((entry) => entry.group === visual.group);
      if (!layout) {
        continue;
      }

      const scrolledBounds = new Rectangle(
        this.root.position.x + visual.bounds.x,
        this.root.position.y + visual.bounds.y - this.scrollOffsetByGroup[visual.group],
        visual.bounds.width,
        visual.bounds.height,
      );
      const viewportBounds = this.viewportBounds(layout);
      if (pointInRoundedRect(globalX, globalY, scrolledBounds) && viewportBounds.contains(globalX, globalY)) {
        return visual.payload;
      }
    }
    return null;
  }

  isPointInReturnToPlayer(globalX: number, globalY: number): boolean {
    if (!this.returnToPlayerBounds) {
      return false;
    }

    const bounds = new Rectangle(
      this.root.position.x + this.returnToPlayerBounds.x,
      this.root.position.y + this.returnToPlayerBounds.y,
      this.returnToPlayerBounds.width,
      this.returnToPlayerBounds.height,
    );
    return pointInRoundedRect(globalX, globalY, bounds);
  }

  setPosition(x: number, y: number): void {
    this.root.position.set(x, y);
    this.render();
  }

  panelBounds(): Rectangle {
    return new Rectangle(this.root.position.x, this.root.position.y, this.boardWidth(), this.boardHeight());
  }

  size(): { width: number; height: number } {
    return { width: this.boardWidth(), height: this.boardHeight() };
  }

  private clampScroll(group: CardGroup): void {
    const maxScroll = Math.max(0, this.contentHeightByGroup[group] - VIEWPORT_HEIGHT);
    this.scrollOffsetByGroup[group] = Math.max(0, Math.min(maxScroll, this.scrollOffsetByGroup[group]));
  }

  private boardWidth(): number {
    return ROOT_PADDING * 2 + PANEL_WIDTH * INVENTORY_GROUP_ORDER.length + PANEL_GAP * (INVENTORY_GROUP_ORDER.length - 1);
  }

  private boardHeight(): number {
    return 32 + PANEL_HEIGHT + ROOT_PADDING;
  }

  private viewportBounds(layout: GroupPanelLayout): Rectangle {
    return new Rectangle(
      this.root.position.x + layout.x + 6,
      this.root.position.y + layout.y + HEADER_HEIGHT,
      layout.width - 12,
      VIEWPORT_HEIGHT,
    );
  }

  private renderScrollbar(layout: GroupPanelLayout): void {
    const contentHeight = this.contentHeightByGroup[layout.group];
    const viewportHeight = VIEWPORT_HEIGHT;
    if (contentHeight <= viewportHeight) {
      return;
    }

    const trackX = layout.x + layout.width - 10;
    const trackY = layout.y + HEADER_HEIGHT + 2;
    const trackHeight = viewportHeight - 4;
    const maxScroll = Math.max(1, contentHeight - viewportHeight);
    const thumbHeight = Math.max(16, (viewportHeight / contentHeight) * trackHeight);
    const thumbTravel = Math.max(0, trackHeight - thumbHeight);
    const thumbY = trackY + (this.scrollOffsetByGroup[layout.group] / maxScroll) * thumbTravel;

    const track = new Graphics();
    track.roundRect(trackX, trackY, SCROLLBAR_WIDTH, trackHeight, 3).fill({ color: 0x20314f, alpha: 1 });
    this.root.addChild(track);

    const thumb = new Graphics();
    thumb.roundRect(trackX, thumbY, SCROLLBAR_WIDTH, thumbHeight, 3).fill({ color: 0x7aa7ec, alpha: 0.9 });
    this.root.addChild(thumb);
  }
}
