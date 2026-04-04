import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CharacterModel } from '../characters/types';
import { INVENTORY_GROUP_ORDER } from '../characters/types';
import type { CardDefinition, CardGroup, CardInstanceState } from '../cards/types';
import type { DragCardPayload } from './dragTypes';

const GROUP_LABEL: Record<CardGroup, string> = {
  techniques: 'Techniques',
  essence: 'Essence',
  sundries: 'Sundries',
  reveries: 'Reveries',
  souls: 'Souls',
};

interface InventoryCardVisual {
  bounds: Rectangle;
  payload: DragCardPayload;
}

const PANEL_WIDTH = 280;
const PANEL_HEIGHT = 660;
const HEADER_HEIGHT = 42;
const VIEWPORT_HEIGHT = PANEL_HEIGHT - HEADER_HEIGHT - 12;

export class CharacterBoardUI {
  readonly root = new Container();

  private readonly cardVisuals: InventoryCardVisual[] = [];

  private readonly content = new Container();

  private readonly contentMask = new Graphics();

  private scrollOffset = 0;

  private contentHeight = 0;

  constructor(
    private readonly character: CharacterModel,
    private readonly cardsById: Map<string, CardDefinition>,
    private readonly getCardState: (instanceId: string) => CardInstanceState,
  ) {}

  render(): void {
    this.root.removeChildren();
    this.content.removeChildren();
    this.cardVisuals.length = 0;

    const panel = new Graphics();
    panel.roundRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT, 12).fill({ color: 0x0f1725, alpha: 0.92 }).stroke({
      color: 0x35507e,
      width: 2,
    });
    this.root.addChild(panel);

    const title = new Text({
      text: `Character: ${this.character.name}`,
      style: { fill: '#dce9ff', fontSize: 15, fontWeight: '700' },
    });
    title.position.set(12, 10);
    this.root.addChild(title);

    this.root.addChild(this.content);

    this.contentMask.clear();
    this.contentMask.rect(10, HEADER_HEIGHT, PANEL_WIDTH - 20, VIEWPORT_HEIGHT).fill({ color: 0xffffff, alpha: 1 });
    this.root.addChild(this.contentMask);
    this.content.mask = this.contentMask;

    let y = HEADER_HEIGHT + 4;
    for (const group of INVENTORY_GROUP_ORDER) {
      y = this.renderGroup(group, y);
    }

    this.contentHeight = y - HEADER_HEIGHT;
    this.applyScroll();
  }

  private renderGroup(group: CardGroup, yStart: number): number {
    const label = new Text({
      text: GROUP_LABEL[group],
      style: { fill: '#8cb4ff', fontSize: 12, fontWeight: '700' },
    });
    label.position.set(12, yStart);
    this.content.addChild(label);

    let y = yStart + 20;
    const list = this.character.inventory[group];

    for (const instance of list) {
      if (this.getCardState(instance.instanceId) !== 'in_inventory') {
        continue;
      }

      const card = this.cardsById.get(instance.cardId);
      if (!card) {
        continue;
      }

      const bg = new Graphics();
      bg.roundRect(12, y, PANEL_WIDTH - 24, 24, 6).fill({ color: this.colorForGroup(group), alpha: 0.95 }).stroke({
        color: 0x1b2537,
        width: 1,
      });
      this.content.addChild(bg);

      const text = new Text({
        text: card.name,
        style: { fill: '#0a1118', fontSize: 12, fontWeight: '700' },
      });
      text.position.set(20, y + 4);
      this.content.addChild(text);

      this.cardVisuals.push({
        bounds: new Rectangle(this.root.position.x + 12, this.root.position.y + y, PANEL_WIDTH - 24, 24),
        payload: { card, instance },
      });

      y += 28;
    }

    return y + 8;
  }

  handleWheel(globalX: number, globalY: number, deltaY: number): boolean {
    if (!this.panelBounds().contains(globalX, globalY)) {
      return false;
    }

    const maxScroll = Math.max(0, this.contentHeight - VIEWPORT_HEIGHT + 12);
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + deltaY));
    this.applyScroll();
    return true;
  }

  private applyScroll(): void {
    this.content.position.set(0, -this.scrollOffset);
  }

  cardAtPoint(globalX: number, globalY: number): DragCardPayload | null {
    for (const visual of this.cardVisuals) {
      const bounds = new Rectangle(visual.bounds.x, visual.bounds.y - this.scrollOffset, visual.bounds.width, visual.bounds.height);
      if (bounds.contains(globalX, globalY)) {
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
    return new Rectangle(this.root.position.x, this.root.position.y, PANEL_WIDTH, PANEL_HEIGHT);
  }

  private colorForGroup(group: CardGroup): number {
    switch (group) {
      case 'techniques':
        return 0xffcf8c;
      case 'essence':
        return 0x8ce5b0;
      case 'sundries':
        return 0x9ac6ff;
      case 'reveries':
        return 0xc7abff;
      case 'souls':
        return 0xffb5c3;
      default:
        return 0xffffff;
    }
  }
}
