import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { CharacterModel } from '../characters/types';
import { INVENTORY_GROUP_ORDER } from '../characters/types';
import type { CardDefinition, CardGroup, CardInstance } from '../cards/types';
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

export class CharacterBoardUI {
  readonly root = new Container();

  private readonly cardVisuals: InventoryCardVisual[] = [];

  private width = 280;

  private height = 0;

  constructor(
    private readonly character: CharacterModel,
    private readonly cardsById: Map<string, CardDefinition>,
  ) {}

  render(): void {
    this.root.removeChildren();
    this.cardVisuals.length = 0;

    const panel = new Graphics();
    panel.roundRect(0, 0, this.width, 660, 12).fill({ color: 0x0f1725, alpha: 0.92 }).stroke({
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

    let y = 42;
    for (const group of INVENTORY_GROUP_ORDER) {
      y = this.renderGroup(group, y);
    }

    this.height = y + 8;
  }

  private renderGroup(group: CardGroup, yStart: number): number {
    const label = new Text({
      text: GROUP_LABEL[group],
      style: { fill: '#8cb4ff', fontSize: 12, fontWeight: '700' },
    });
    label.position.set(12, yStart);
    this.root.addChild(label);

    let y = yStart + 20;
    const list = this.character.inventory[group];

    for (const instance of list) {
      const card = this.cardsById.get(instance.cardId);
      if (!card) {
        continue;
      }

      const bg = new Graphics();
      bg.roundRect(12, y, this.width - 24, 24, 6).fill({ color: this.colorForGroup(group), alpha: 0.95 }).stroke({
        color: 0x1b2537,
        width: 1,
      });
      this.root.addChild(bg);

      const text = new Text({
        text: card.name,
        style: { fill: '#0a1118', fontSize: 12, fontWeight: '700' },
      });
      text.position.set(20, y + 4);
      this.root.addChild(text);

      this.cardVisuals.push({
        bounds: new Rectangle(this.root.position.x + 12, this.root.position.y + y, this.width - 24, 24),
        payload: { card, instance },
      });

      y += 28;
    }

    return y + 8;
  }

  cardAtPoint(globalX: number, globalY: number): DragCardPayload | null {
    for (const visual of this.cardVisuals) {
      if (visual.bounds.contains(globalX, globalY)) {
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
    return new Rectangle(this.root.position.x, this.root.position.y, this.width, this.height);
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
