import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { getCompatibilityHint } from '../actions/compatibility';
import type { StagedTileAction } from '../actions/types';
import type { CardDefinition } from '../cards/types';

interface TokenHitArea {
  index: number;
  bounds: Rectangle;
}

export class StagedActionUI {
  readonly root = new Container();

  private staged: StagedTileAction | null = null;

  private readonly cardsById: Map<string, CardDefinition>;

  private readonly getCardByInstanceId: (instanceId: string) => CardDefinition | undefined;

  private startBounds: Rectangle | null = null;

  private repeatBounds: Rectangle | null = null;

  private inputDropBounds: Rectangle | null = null;

  private clearBounds: Rectangle | null = null;

  private tokenAreas: TokenHitArea[] = [];

  private inputDropHighlight = false;

  constructor(
    cardsById: Map<string, CardDefinition>,
    getCardByInstanceId: (instanceId: string) => CardDefinition | undefined,
  ) {
    this.cardsById = cardsById;
    this.getCardByInstanceId = getCardByInstanceId;
  }

  setPosition(x: number, y: number): void {
    this.root.position.set(x, y);
    this.render();
  }

  setInputDropHighlight(active: boolean): void {
    if (this.inputDropHighlight === active) {
      return;
    }
    this.inputDropHighlight = active;
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
    this.clearBounds = null;
    this.tokenAreas = [];

    const panel = new Graphics();
    panel.roundRect(0, 0, 320, 280, 12).fill({ color: 0x0f1725, alpha: 0.92 }).stroke({
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

    const verbCard = this.getCardByInstanceId(this.staged.verbCardInstanceId);
    const verbLabel = verbCard?.name ?? this.staged.verbCardInstanceId;

    const verbText = new Text({ text: `Verb: ${verbLabel}`, style: { fill: '#ffe2ad', fontSize: 13, fontWeight: '700' } });
    verbText.position.set(12, 42);
    this.root.addChild(verbText);

    const hintText = new Text({
      text: getCompatibilityHint(verbCard?.id ?? ''),
      style: { fill: '#8fd9fc', fontSize: 10 },
    });
    hintText.position.set(12, 62);
    this.root.addChild(hintText);

    const statusText = new Text({
      text: `Status: ${this.staged.status}${this.staged.error ? ` (${this.staged.error})` : ''}`,
      style: { fill: this.staged.status === 'queued' ? '#95f2a8' : '#a9bfdc', fontSize: 11 },
    });
    statusText.position.set(12, 78);
    this.root.addChild(statusText);

    const dropZoneY = 100;
    const dropZone = new Graphics();
    dropZone.roundRect(12, dropZoneY, 296, 104, 8).fill({ color: 0x192235, alpha: 1 }).stroke({
      color: this.inputDropHighlight ? 0x80f5b4 : 0x49618b,
      width: this.inputDropHighlight ? 2 : 1,
    });
    this.root.addChild(dropZone);
    this.inputDropBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + dropZoneY, 296, 104);

    const slotText = new Text({
      text: this.staged.inputCardInstanceIds.length > 0 ? 'Staged inputs' : 'Drop compatible cards here',
      style: { fill: '#d5e5ff', fontSize: 12 },
    });
    slotText.position.set(18, dropZoneY + 8);
    this.root.addChild(slotText);

    let chipX = 18;
    let chipY = dropZoneY + 32;
    for (let index = 0; index < this.staged.inputCardInstanceIds.length; index += 1) {
      const instanceId = this.staged.inputCardInstanceIds[index];
      const cardName = this.getCardByInstanceId(instanceId)?.name ?? this.cardsById.get(instanceId)?.name ?? instanceId;
      const chipTextWidth = Math.max(32, cardName.length * 6);
      const chipWidth = Math.min(132, chipTextWidth + 26);
      if (chipX + chipWidth > 302) {
        chipX = 18;
        chipY += 24;
      }

      const chip = new Graphics();
      chip.roundRect(chipX, chipY, chipWidth, 20, 10).fill({ color: 0x2a3e5f }).stroke({ color: 0x7ba9ef, width: 1 });
      this.root.addChild(chip);

      const chipText = new Text({ text: cardName, style: { fill: '#e8f1ff', fontSize: 10, fontWeight: '700' } });
      chipText.position.set(chipX + 7, chipY + 4);
      this.root.addChild(chipText);

      const closeText = new Text({ text: '×', style: { fill: '#d6ebff', fontSize: 11, fontWeight: '700' } });
      closeText.position.set(chipX + chipWidth - 12, chipY + 3);
      this.root.addChild(closeText);

      this.tokenAreas.push({
        index,
        bounds: new Rectangle(this.root.position.x + chipX, this.root.position.y + chipY, chipWidth, 20),
      });

      chipX += chipWidth + 8;
    }

    const repeatBtn = new Graphics();
    repeatBtn.roundRect(12, 232, 98, 34, 8).fill({ color: this.staged.repeat ? 0x6ac98f : 0x48607e, alpha: 1 });
    this.root.addChild(repeatBtn);

    const repeatText = new Text({
      text: `Repeat: ${this.staged.repeat ? 'ON' : 'OFF'}`,
      style: { fill: '#091118', fontSize: 12, fontWeight: '700' },
    });
    repeatText.position.set(21, 242);
    this.root.addChild(repeatText);
    this.repeatBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + 232, 98, 34);

    const clearBtn = new Graphics();
    clearBtn.roundRect(116, 232, 86, 34, 8).fill({ color: 0x965a5a, alpha: 1 });
    this.root.addChild(clearBtn);

    const clearText = new Text({ text: 'Cancel', style: { fill: '#ffe9e9', fontSize: 12, fontWeight: '700' } });
    clearText.position.set(138, 242);
    this.root.addChild(clearText);
    this.clearBounds = new Rectangle(this.root.position.x + 116, this.root.position.y + 232, 86, 34);

    const startBtn = new Graphics();
    startBtn.roundRect(206, 232, 102, 34, 8).fill({ color: 0xffb74d, alpha: 1 });
    this.root.addChild(startBtn);

    const startText = new Text({
      text: this.staged.status === 'queued' ? 'Queued' : 'Start',
      style: { fill: '#14181f', fontSize: 12, fontWeight: '700' },
    });
    startText.position.set(236, 242);
    this.root.addChild(startText);
    this.startBounds = new Rectangle(this.root.position.x + 206, this.root.position.y + 232, 102, 34);
  }

  inputChipIndexAt(globalX: number, globalY: number): number | null {
    for (const area of this.tokenAreas) {
      if (area.bounds.contains(globalX, globalY)) {
        return area.index;
      }
    }
    return null;
  }

  isPointInClear(globalX: number, globalY: number): boolean {
    return this.clearBounds?.contains(globalX, globalY) ?? false;
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
