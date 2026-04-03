import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import type { StagedTileAction } from '../actions/types';
import type { CardDefinition } from '../cards/types';

export class StagedActionUI {
  readonly root = new Container();

  private staged: StagedTileAction | null = null;

  private readonly verbsById: Map<string, { name: string }>;

  private readonly cardsById: Map<string, CardDefinition>;

  private startBounds: Rectangle | null = null;

  private repeatBounds: Rectangle | null = null;

  private inputDropBounds: Rectangle | null = null;

  constructor(verbsById: Map<string, { name: string }>, cardsById: Map<string, CardDefinition>) {
    this.verbsById = verbsById;
    this.cardsById = cardsById;
  }

  setPosition(x: number, y: number): void {
    this.root.position.set(x, y);
    this.render();
  }

  setStagedAction(staged: StagedTileAction | null): void {
    this.staged = staged;
    this.render();
  }

  render(): void {
    this.root.removeChildren();
    this.startBounds = null;
    this.repeatBounds = null;
    this.inputDropBounds = null;

    const panel = new Graphics();
    panel.roundRect(0, 0, 320, 220, 12).fill({ color: 0x0f1725, alpha: 0.92 }).stroke({
      color: 0x35507e,
      width: 2,
    });
    this.root.addChild(panel);

    const title = new Text({
      text: 'Tile Action Staging',
      style: { fill: '#dce9ff', fontSize: 15, fontWeight: '700' },
    });
    title.position.set(12, 10);
    this.root.addChild(title);

    if (!this.staged) {
      const empty = new Text({ text: 'Drop an Action card on a hex tile first.', style: { fill: '#a9bfdc', fontSize: 12 } });
      empty.position.set(12, 42);
      this.root.addChild(empty);
      return;
    }

    const verbLabel = this.verbsById.get(this.staged.verbId)?.name ?? this.staged.verbId;
    const verbText = new Text({ text: `Verb: ${verbLabel}`, style: { fill: '#ffe2ad', fontSize: 13, fontWeight: '700' } });
    verbText.position.set(12, 42);
    this.root.addChild(verbText);

    const statusText = new Text({
      text: `Status: ${this.staged.status}${this.staged.error ? ` (${this.staged.error})` : ''}`,
      style: { fill: this.staged.status === 'queued' ? '#95f2a8' : '#a9bfdc', fontSize: 11 },
    });
    statusText.position.set(12, 62);
    this.root.addChild(statusText);

    const dropZoneY = 84;
    const dropZone = new Graphics();
    dropZone.roundRect(12, dropZoneY, 296, 78, 8).fill({ color: 0x192235, alpha: 1 }).stroke({
      color: 0x49618b,
      width: 1,
    });
    this.root.addChild(dropZone);
    this.inputDropBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + dropZoneY, 296, 78);

    const slotText = new Text({
      text:
        this.staged.inputCardIds.length > 0
          ? this.staged.inputCardIds.map((id) => this.cardsById.get(id)?.name ?? id).join(', ')
          : 'Drop compatible cards here',
      style: { fill: '#d5e5ff', fontSize: 12, wordWrap: true, wordWrapWidth: 280 },
    });
    slotText.position.set(18, dropZoneY + 8);
    this.root.addChild(slotText);

    const repeatBtn = new Graphics();
    repeatBtn.roundRect(12, 172, 110, 34, 8).fill({ color: this.staged.repeat ? 0x6ac98f : 0x48607e, alpha: 1 });
    this.root.addChild(repeatBtn);

    const repeatText = new Text({
      text: `Repeat: ${this.staged.repeat ? 'ON' : 'OFF'}`,
      style: { fill: '#091118', fontSize: 12, fontWeight: '700' },
    });
    repeatText.position.set(24, 182);
    this.root.addChild(repeatText);
    this.repeatBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + 172, 110, 34);

    const startBtn = new Graphics();
    startBtn.roundRect(196, 172, 112, 34, 8).fill({ color: 0xffb74d, alpha: 1 });
    this.root.addChild(startBtn);

    const startText = new Text({
      text: this.staged.status === 'queued' ? 'Queued' : 'Start',
      style: { fill: '#14181f', fontSize: 12, fontWeight: '700' },
    });
    startText.position.set(236, 182);
    this.root.addChild(startText);
    this.startBounds = new Rectangle(this.root.position.x + 196, this.root.position.y + 172, 112, 34);
  }

  isPointInStart(globalX: number, globalY: number): boolean {
    return this.startBounds?.contains(globalX, globalY) ?? false;
  }

  isPointInRepeat(globalX: number, globalY: number): boolean {
    return this.repeatBounds?.contains(globalX, globalY) ?? false;
  }

  isPointInInputDrop(globalX: number, globalY: number): boolean {
    return this.inputDropBounds?.contains(globalX, globalY) ?? false;
  }
}
