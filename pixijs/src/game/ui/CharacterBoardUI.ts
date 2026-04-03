import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CharacterModel } from '../characters/types';
import { INVENTORY_GROUP_ORDER } from '../characters/types';
import type { CardDefinition, CardGroup, CardInstanceState } from '../cards/types';
import type { DragCardPayload } from './dragTypes';

const GROUP_LABEL: Record<CardGroup, string> = {
  actions: 'Actions',
  attributes: 'Attributes',
  items: 'Items',
  memories: 'Memories',
  people: 'People',
};

interface InventoryCardVisual {
  bounds: Rectangle;
  payload: DragCardPayload;
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

export class CharacterBoardUI {
  readonly root = new Container();

  private readonly cardVisuals: InventoryCardVisual[] = [];

  private readonly scrollOffsetByGroup: Record<CardGroup, number> = {
    actions: 0,
    attributes: 0,
    items: 0,
    memories: 0,
    people: 0,
  };

  private readonly contentHeightByGroup: Record<CardGroup, number> = {
    actions: 0,
    attributes: 0,
    items: 0,
    memories: 0,
    people: 0,
  };

  private readonly layouts: GroupPanelLayout[] = [];

  constructor(
    private readonly character: CharacterModel,
    private readonly cardsById: Map<string, CardDefinition>,
    private readonly getCardState: (instanceId: string) => CardInstanceState,
  ) {}

  render(): void {
    this.root.removeChildren();
    this.cardVisuals.length = 0;
    this.layouts.length = 0;

    const board = new Graphics();
    board.roundRect(0, 0, this.boardWidth(), this.boardHeight(), 12).fill({ color: 0x0b1320, alpha: 0.85 }).stroke({
      color: 0x2d4772,
      width: 2,
    });
    this.root.addChild(board);

    const title = new Text({
      text: `Character: ${this.character.name}`,
      style: { fill: '#dce9ff', fontSize: 14, fontWeight: '700' },
    });
    title.position.set(12, 8);
    this.root.addChild(title);

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
      text: GROUP_LABEL[group],
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

    const list = this.character.inventory[group];
    let rowY = y + HEADER_HEIGHT + 4;

    for (const instance of list) {
      if (this.getCardState(instance.instanceId) !== 'in_inventory') {
        continue;
      }

      const card = this.cardsById.get(instance.cardId);
      if (!card) {
        continue;
      }

      const bg = new Graphics();
      bg.roundRect(x + 8, rowY, width - 16, 24, 6).fill({ color: this.colorForGroup(group), alpha: 0.95 }).stroke({
        color: 0x1b2537,
        width: 1,
      });
      content.addChild(bg);

      const text = new Text({
        text: card.name,
        style: { fill: '#0a1118', fontSize: 12, fontWeight: '700' },
      });
      text.position.set(x + 14, rowY + 4);
      content.addChild(text);

      this.cardVisuals.push({
        bounds: new Rectangle(x + 8, rowY, width - 16, 24),
        payload: { card, instance },
      });

      rowY += 28;
    }

    this.contentHeightByGroup[group] = rowY - (y + HEADER_HEIGHT);
    this.clampScroll(group);

    const scrollOffset = this.scrollOffsetByGroup[group];
    content.position.set(0, -scrollOffset);
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
    for (const visual of this.cardVisuals) {
      const group = visual.payload.card.group;
      const layout = this.layouts.find((entry) => entry.group === group);
      if (!layout) {
        continue;
      }

      const scrolledBounds = new Rectangle(
        this.root.position.x + visual.bounds.x,
        this.root.position.y + visual.bounds.y - this.scrollOffsetByGroup[group],
        visual.bounds.width,
        visual.bounds.height,
      );
      const viewportBounds = this.viewportBounds(layout);
      if (scrolledBounds.contains(globalX, globalY) && viewportBounds.contains(globalX, globalY)) {
        return visual.payload;
      }
    }
    return null;
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
    const maxScroll = Math.max(0, this.contentHeightByGroup[group] - VIEWPORT_HEIGHT + 8);
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

  private colorForGroup(group: CardGroup): number {
    switch (group) {
      case 'actions':
        return 0xffcf8c;
      case 'attributes':
        return 0x8ce5b0;
      case 'items':
        return 0x9ac6ff;
      case 'memories':
        return 0xc7abff;
      case 'people':
        return 0xffb5c3;
      default:
        return 0xffffff;
    }
  }
}
