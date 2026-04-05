import { Container, Graphics, Rectangle, Text } from 'pixi.js';
import { getCompatibilityHint } from '../actions/compatibility';
import type { StagedTileAction } from '../actions/types';
import { CARD_GROUP_LABEL, type CardDefinition } from '../cards/types';
import type { DropFeedbackState } from '../render/HexBoardRenderer';
import type { BoardTile, TileTypeDefinition, VerbDefinition } from '../world/types';
import { isHexTile } from '../world/types';
import { readableTextColor, renderCardTag } from './cardVisual';

interface TokenHitArea {
  index: number;
  bounds: Rectangle;
}

export interface SelectedTileDetails {
  tile: BoardTile;
  tileType?: TileTypeDefinition;
  availableVerbs: VerbDefinition[];
  stagedAction: StagedTileAction | null;
}

export interface SelectedCardDetails {
  card: CardDefinition;
  instanceId: string;
}

export class StagedActionUI {
  readonly root = new Container();

  private selectedTile: SelectedTileDetails | null = null;

  private selectedCard: SelectedCardDetails | null = null;

  private readonly cardsById: Map<number, CardDefinition>;

  private readonly getCardByInstanceId: (instanceId: string) => CardDefinition | undefined;

  private startBounds: Rectangle | null = null;

  private repeatBounds: Rectangle | null = null;

  private inputDropBounds: Rectangle | null = null;

  private clearBounds: Rectangle | null = null;

  private panelBounds: Rectangle | null = null;

  private tokenAreas: TokenHitArea[] = [];

  private inputDropFeedback: DropFeedbackState = 'none';

  constructor(
    cardsById: Map<number, CardDefinition>,
    getCardByInstanceId: (instanceId: string) => CardDefinition | undefined,
  ) {
    this.cardsById = cardsById;
    this.getCardByInstanceId = getCardByInstanceId;
  }

  setPosition(x: number, y: number): void {
    this.root.position.set(x, y);
    this.render();
  }

  setInputDropFeedback(state: DropFeedbackState): void {
    if (this.inputDropFeedback === state) {
      return;
    }
    this.inputDropFeedback = state;
    this.render();
  }

  setStagedAction(staged: StagedTileAction | null): void {
    if (!this.selectedTile) {
      return;
    }
    this.selectedTile = {
      ...this.selectedTile,
      stagedAction: staged,
    };
    this.render();
  }

  setSelectedTile(selectedTile: SelectedTileDetails | null): void {
    this.selectedTile = selectedTile;
    this.selectedCard = null;
    this.render();
  }

  setSelectedCard(selectedCard: SelectedCardDetails | null): void {
    this.selectedCard = selectedCard;
    this.selectedTile = null;
    this.render();
  }

  render(): void {
    this.root.visible = this.selectedTile !== null || this.selectedCard !== null;
    this.root.removeChildren();
    this.startBounds = null;
    this.repeatBounds = null;
    this.inputDropBounds = null;
    this.clearBounds = null;
    this.panelBounds = null;
    this.tokenAreas = [];

    if (!this.selectedTile && !this.selectedCard) {
      return;
    }

    const panel = new Graphics();
    panel.roundRect(0, 0, 360, 340, 12).fill({ color: 0x0f1725, alpha: 0.92 }).stroke({
      color: 0x35507e,
      width: 2,
    });
    this.root.addChild(panel);
    this.panelBounds = new Rectangle(this.root.position.x, this.root.position.y, 360, 340);

    const title = new Text({
      text: 'Details Panel',
      style: { fill: '#dce9ff', fontSize: 15, fontWeight: '700' },
    });
    title.position.set(12, 10);
    this.root.addChild(title);

    if (this.selectedCard) {
      const { card, instanceId } = this.selectedCard;
      renderCardTag(this.root, { x: 12, y: 42, card, width: 108, height: 30 });

      const cardTitle = new Text({ text: CARD_GROUP_LABEL[card.group].toUpperCase(), style: { fill: '#dce9ff', fontSize: 10, fontWeight: '700' } });
      cardTitle.position.set(130, 58);
      this.root.addChild(cardTitle);

      const cardIdText = new Text({
        text: `Card Id: ${card.id}`,
        style: { fill: '#a9bfdc', fontSize: 11 },
      });
      cardIdText.position.set(12, 96);
      this.root.addChild(cardIdText);

      const instanceText = new Text({
        text: `Instance: ${instanceId}`,
        style: { fill: '#8fd9fc', fontSize: 11 },
      });
      instanceText.position.set(12, 114);
      this.root.addChild(instanceText);

      const hintText = new Text({
        text: 'Drag this card to stage or attach it. Click tiles to inspect tile details.',
        style: { fill: '#d5e5ff', fontSize: 12 },
      });
      hintText.position.set(12, 146);
      this.root.addChild(hintText);
      return;
    }

    const selectedTile = this.selectedTile;
    if (!selectedTile) {
      return;
    }

    const { tile, tileType, availableVerbs, stagedAction } = selectedTile;

    const tileTypeName = tileType?.name ?? tile.tileType;
    const tileContextLabel = isHexTile(tile) ? `(${tile.q}, ${tile.r})` : `Soul Event • ${tile.soulId}`;
    const tileTitle = new Text({
      text: `${tileTypeName} ${tileContextLabel}`,
      style: { fill: '#f6e9c5', fontSize: 13, fontWeight: '700' },
    });
    tileTitle.position.set(12, 38);
    this.root.addChild(tileTitle);

    const attributesText = new Text({
      text: `Attributes: Move ${tileType?.defaultProperties.moveCost ?? '?'}, Blocks Sight ${tileType?.defaultProperties.blocksSight ? 'Yes' : 'No'}`,
      style: { fill: '#a9bfdc', fontSize: 11 },
    });
    attributesText.position.set(12, 58);
    this.root.addChild(attributesText);

    const hiddenEssenceText = new Text({
      text: isHexTile(tile) ? `Hidden: Presence ${tile.hiddenPresenceCount}` : `Hosted Event: ${tile.eventLabel}`,
      style: { fill: '#e4c67e', fontSize: 11, fontWeight: '700' },
    });
    hiddenEssenceText.position.set(12, 74);
    this.root.addChild(hiddenEssenceText);

    const attachedVerbsText = new Text({
      text: `Tile Verbs: ${availableVerbs.length > 0 ? availableVerbs.map((verb) => verb.name).join(', ') : 'None'}`,
      style: { fill: '#8fd9fc', fontSize: 11 },
    });
    attachedVerbsText.position.set(12, 92);
    this.root.addChild(attachedVerbsText);

    if (!stagedAction) {
      const empty = new Text({
        text: 'No staged action on this tile. Drop a Technique card on the tile to begin.',
        style: { fill: '#a9bfdc', fontSize: 12 },
      });
      empty.position.set(12, 118);
      this.root.addChild(empty);
      return;
    }

    const verbCard = this.getCardByInstanceId(stagedAction.verbCardInstanceId);
    const verbLabel = verbCard?.name ?? stagedAction.verbCardInstanceId;

    renderCardTag(this.root, {
      x: 12,
      y: 114,
      card: verbCard ?? {
        id: -1,
        key: stagedAction.verbCardInstanceId,
        name: verbLabel,
        group: 'techniques',
        backgroundColor: 0xf6e9c5,
      },
      width: 108,
      height: 28,
    });
    const verbText = new Text({ text: 'Verb', style: { fill: '#d5e5ff', fontSize: 11, fontWeight: '700' } });
    verbText.position.set(130, 126);
    this.root.addChild(verbText);

    const hintText = new Text({
      text: getCompatibilityHint(verbCard?.key ?? ''),
      style: { fill: '#8fd9fc', fontSize: 10 },
    });
    hintText.position.set(12, 160);
    this.root.addChild(hintText);

    const stagedTitles = (
      stagedAction.status === 'queued' && stagedAction.queuedInputCardNames?.length
        ? stagedAction.queuedInputCardNames
        : stagedAction.inputCardInstanceIds
          .map((instanceId) => this.getCardByInstanceId(instanceId)?.name ?? this.cardsById.get(Number(instanceId))?.name ?? instanceId)
    ).join(', ');
    const stagedText = new Text({
      text: `Staged: ${stagedTitles.length > 0 ? stagedTitles : 'None'}`,
      style: { fill: '#d5e5ff', fontSize: 11, fontWeight: '700' },
    });
    stagedText.position.set(12, 174);
    this.root.addChild(stagedText);

    const statusText = new Text({
      text: `Status: ${stagedAction.status}${stagedAction.error ? ` (${stagedAction.error})` : ''}`,
      style: { fill: stagedAction.status === 'queued' ? '#95f2a8' : stagedAction.status === 'running' ? '#ffe0a6' : '#a9bfdc', fontSize: 11 },
    });
    statusText.position.set(12, 190);
    this.root.addChild(statusText);

    const dropZoneY = 196;
    const dropZone = new Graphics();
    const dropOutlineColor = this.inputDropFeedback === 'valid'
      ? 0x80f5b4
      : this.inputDropFeedback === 'invalid'
        ? 0xff7d7d
        : 0x49618b;
    const dropOutlineWidth = this.inputDropFeedback === 'none' ? 1 : 2;
    dropZone.roundRect(12, dropZoneY, 336, 104, 8).fill({ color: 0x192235, alpha: 1 }).stroke({
      color: dropOutlineColor,
      width: dropOutlineWidth,
    });
    this.root.addChild(dropZone);
    this.inputDropBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + dropZoneY, 336, 104);

    const slotText = new Text({
      text: stagedAction.inputCardInstanceIds.length > 0 ? 'Staged inputs' : 'Drop compatible cards here',
      style: { fill: '#d5e5ff', fontSize: 12 },
    });
    slotText.position.set(18, dropZoneY + 8);
    this.root.addChild(slotText);

    let chipX = 18;
    let chipY = dropZoneY + 32;
    for (let index = 0; index < stagedAction.inputCardInstanceIds.length; index += 1) {
      const instanceId = stagedAction.inputCardInstanceIds[index];
      const cardData = this.getCardByInstanceId(instanceId) ?? this.cardsById.get(Number(instanceId));
      const cardName = cardData?.name ?? instanceId;
      const chipColor = cardData?.backgroundColor ?? 0x2a3e5f;
      const chipTextColor = readableTextColor(chipColor);
      const chipTextWidth = Math.max(32, cardName.length * 6);
      const chipWidth = Math.min(132, chipTextWidth + 26);
      if (chipX + chipWidth > 342) {
        chipX = 18;
        chipY += 24;
      }

      const chip = new Graphics();
      chip.roundRect(chipX, chipY, chipWidth, 20, 8).fill({ color: chipColor }).stroke({ color: 0x1b2537, width: 1 });
      this.root.addChild(chip);

      const chipText = new Text({ text: cardName, style: { fill: chipTextColor, fontSize: 10, fontWeight: '700' } });
      chipText.position.set(chipX + 7, chipY + 4);
      this.root.addChild(chipText);

      const closeText = new Text({ text: '×', style: { fill: chipTextColor, fontSize: 11, fontWeight: '700' } });
      closeText.position.set(chipX + chipWidth - 12, chipY + 3);
      this.root.addChild(closeText);

      this.tokenAreas.push({
        index,
        bounds: new Rectangle(this.root.position.x + chipX, this.root.position.y + chipY, chipWidth, 20),
      });

      chipX += chipWidth + 8;
    }

    const repeatBtn = new Graphics();
    repeatBtn.roundRect(12, 304, 116, 30, 8).fill({ color: stagedAction.repeat ? 0x6ac98f : 0x48607e, alpha: 1 });
    this.root.addChild(repeatBtn);

    const repeatText = new Text({
      text: `Repeat: ${stagedAction.repeat ? 'ON' : 'OFF'}`,
      style: { fill: '#091118', fontSize: 11, fontWeight: '700' },
    });
    repeatText.position.set(24, 312);
    this.root.addChild(repeatText);
    this.repeatBounds = new Rectangle(this.root.position.x + 12, this.root.position.y + 304, 116, 30);

    const clearBtn = new Graphics();
    clearBtn.roundRect(136, 304, 98, 30, 8).fill({ color: 0x965a5a, alpha: 1 });
    this.root.addChild(clearBtn);

    const clearText = new Text({ text: 'Cancel', style: { fill: '#ffe9e9', fontSize: 11, fontWeight: '700' } });
    clearText.position.set(166, 312);
    this.root.addChild(clearText);
    this.clearBounds = new Rectangle(this.root.position.x + 136, this.root.position.y + 304, 98, 30);

    const startBtn = new Graphics();
    startBtn.roundRect(242, 304, 106, 30, 8).fill({ color: 0xffb74d, alpha: 1 });
    this.root.addChild(startBtn);

    const startText = new Text({
      text: stagedAction.status === 'queued' ? 'Queued' : stagedAction.status === 'running' ? 'Running' : 'Start',
      style: { fill: '#14181f', fontSize: 11, fontWeight: '700' },
    });
    startText.position.set(278, 312);
    this.root.addChild(startText);
    this.startBounds = new Rectangle(this.root.position.x + 242, this.root.position.y + 304, 106, 30);
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

  isPointInPanel(globalX: number, globalY: number): boolean {
    return this.panelBounds?.contains(globalX, globalY) ?? false;
  }
}
