import { Container, Graphics, Text } from "pixi.js";
import type { DefinitionLookup, DerivedGameViewModel, EntityId, TrackedCard, TrackedTile, ViewModelSelection } from "../model";
import { idToKey } from "../model";
import type { TileDefinitionInfo } from "../data/card_definition_store";

type DetailsPanelParams = {
  viewModel: DerivedGameViewModel;
  observerCardId?: EntityId;
  viewedCardId?: EntityId;
  selection?: ViewModelSelection;
  definitionLookup?: DefinitionLookup;
  tileDefinitionLookup?: (definitionId: EntityId) => TileDefinitionInfo | undefined;
  width: number;
  height: number;
};

const CARD_TYPES_WITH_FLAGS_PANEL = new Set([2, 3, 4, 5]);

export class DetailsPanelRenderer {
  readonly container = new Container();

  render(params: DetailsPanelParams): void {
    this.container.removeChildren();

    const root = this.drawPanel(0, 0, params.width, params.height, 8);
    this.container.addChild(root);

    if (!params.selection) {
      this.drawBodyText([`Observer: ${this.formatIdForDisplay(params.observerCardId)}`, `Viewed: ${this.formatIdForDisplay(params.viewedCardId)}`, "", "Select a tile or card."], 12, 12, params.width - 24);
      return;
    }

    const selectedCard = this.resolveSelectedCard(params.viewModel, params.selection);
    if (!selectedCard) {
      this.drawBodyText([`Card ${params.selection.id} not found.`], 12, 12, params.width - 24);
      return;
    }

    this.renderByCardType(params, selectedCard);
  }

  private renderByCardType(params: DetailsPanelParams, selectedCard: TrackedCard): void {
    if (selectedCard.card.cardType === 6) {
      this.renderWorldTileDetails(params, selectedCard);
      return;
    }

    if (CARD_TYPES_WITH_FLAGS_PANEL.has(selectedCard.card.cardType)) {
      const definition = params.definitionLookup?.(selectedCard.card.cardType, selectedCard.card.definitionId);
      this.drawTitle(definition?.name ?? "Unknown", 12, 10, params.width - 24);
      const flagsPanelY = 36;
      const flagsPanelHeight = Math.max(88, params.height - flagsPanelY - 10);
      const flagsBodyY = this.drawSubPanel("Flags", 10, flagsPanelY, params.width - 20, flagsPanelHeight);
      this.drawBodyText(
        this.toFlagLines(this.getVisibleFlagsFromDefinition(definition)),
        20,
        flagsBodyY,
        params.width - 40,
      );
      return;
    }

    if (selectedCard.card.cardType === 1) {
      const definition = params.definitionLookup?.(selectedCard.card.cardType, selectedCard.card.definitionId);
      this.drawTitle(definition?.name ?? "Unknown", 12, 10, params.width - 24);
      return;
    }

    const fallbackDefinition = params.definitionLookup?.(selectedCard.card.cardType, selectedCard.card.definitionId);
    this.drawTitle(fallbackDefinition?.name ?? "Unknown", 12, 10, params.width - 24);
    this.drawBodyText([`Type: ${selectedCard.card.cardType}`], 12, 36, params.width - 24);
  }

  private renderWorldTileDetails(params: DetailsPanelParams, selectedTileCard: TrackedCard): void {
    const tileDefinitionId = selectedTileCard.card.definitionId;
    const title = params.tileDefinitionLookup?.(tileDefinitionId)?.name
      ?? params.definitionLookup?.(6, tileDefinitionId)?.name
      ?? "Unknown Tile";
    this.drawTitle(title, 12, 10, params.width - 24);

    const firstPanelY = 36;
    const firstPanelHeight = Math.max(88, Math.floor(params.height * 0.28));
    const firstPanelBodyY = this.drawSubPanel("Flags", 10, firstPanelY, params.width - 20, firstPanelHeight);

    const flags = this.getVisibleTileFlags(selectedTileCard, params.tileDefinitionLookup);
    this.drawBodyText(
      this.toFlagLines(flags),
      20,
      firstPanelBodyY,
      params.width - 40,
    );

    const secondPanelY = firstPanelY + firstPanelHeight + 10;
    const secondPanelHeight = Math.max(120, params.height - secondPanelY - 10);
    const secondPanelBodyY = this.drawSubPanel(undefined, 10, secondPanelY, params.width - 20, secondPanelHeight);

    const attachedCards = this.findAttachedCardsBySharedPosition(params.viewModel, selectedTileCard);
    const viewedSoulIdKey = params.viewedCardId ? idToKey(params.viewedCardId) : undefined;
    const disciplineCards = attachedCards.filter((card) => card.card.cardType === 1);
    const ownedDisciplineCards = disciplineCards.filter((card) => viewedSoulIdKey !== undefined && idToKey(card.card.ownerCardId) === viewedSoulIdKey);
    const nestedCards = attachedCards.filter((card) => {
      if (card.card.cardType < 2 || card.card.cardType > 5) {
        return false;
      }
      if (!viewedSoulIdKey) {
        return false;
      }
      if (idToKey(card.card.cardId) === viewedSoulIdKey) {
        return false;
      }
      return idToKey(card.card.ownerCardId) === viewedSoulIdKey;
    });

    this.drawBodyText(
      ["Discipline", ...this.toCardLines(ownedDisciplineCards, params.definitionLookup)],
      20,
      secondPanelBodyY,
      params.width - 40,
    );

    const nestedPanelY = secondPanelY + 78;
    const nestedPanelHeight = Math.max(54, secondPanelHeight - 88);
    const nestedPanelBodyY = this.drawSubPanel(undefined, 20, nestedPanelY, params.width - 40, nestedPanelHeight);
    this.drawBodyText(
      this.toCardLines(nestedCards, params.definitionLookup),
      28,
      nestedPanelBodyY,
      params.width - 56,
    );
  }

  private getVisibleTileFlags(
    tileCard: TrackedCard,
    tileDefinitionLookup: ((definitionId: EntityId) => TileDefinitionInfo | undefined) | undefined,
  ): Array<{ name: string }> {
    const tileDefinitionId = tileCard.card.definitionId;
    const definition = tileDefinitionLookup?.(tileDefinitionId);
    if (!definition) {
      return [];
    }

    return this.getVisibleFlagsFromDefinition(definition);
  }

  private getVisibleFlagsFromDefinition(definition: { flags: Array<{ name: string; show: boolean }> } | undefined): Array<{ name: string }> {
    if (!definition) {
      return [];
    }

    return definition.flags.filter((flag) => flag.show === true).map((flag) => ({ name: flag.name }));
  }

  private toFlagLines(flags: Array<{ name: string }>): string[] {
    return flags.length > 0 ? flags.map((flag) => `• ${flag.name}`) : ["(no visible flags)"];
  }

  private findAttachedCardsBySharedPosition(viewModel: DerivedGameViewModel, selectedTileCard: TrackedCard): TrackedCard[] {
    const selectedTracker = selectedTileCard.tracker;
    if (!selectedTracker) {
      return [];
    }

    const selectedIdKey = idToKey(selectedTileCard.card.cardId);

    return this.collectAllCards(viewModel).filter((trackedCard) => {
      if (idToKey(trackedCard.card.cardId) === selectedIdKey) {
        return false;
      }
      if (!trackedCard.tracker) {
        return false;
      }
      return (
        trackedCard.tracker.q === selectedTracker.q
        && trackedCard.tracker.r === selectedTracker.r
        && trackedCard.tracker.z === selectedTracker.z
      );
    });
  }

  private collectAllCards(viewModel: DerivedGameViewModel): TrackedCard[] {
    const deduped = new Map<string, TrackedCard>();
    const sources: TrackedCard[] = [
      ...(viewModel.viewedSelfCard ? [viewModel.viewedSelfCard] : []),
      ...viewModel.worldTiles.flatMap((tile) => tile.attachedCards),
      ...viewModel.eventTiles.flatMap((tile) => tile.attachedCards),
      ...viewModel.slotTiles.flatMap((tile) => tile.attachedCards),
      ...Object.values(viewModel.inventories).flat(),
    ];

    for (const trackedCard of sources) {
      deduped.set(idToKey(trackedCard.card.cardId), trackedCard);
    }

    return [...deduped.values()];
  }

  private toCardLines(cards: TrackedCard[], definitionLookup: DefinitionLookup | undefined): string[] {
    if (cards.length === 0) {
      return ["(none)"];
    }

    return cards.map((card) => {
      const name = definitionLookup?.(card.card.cardType, card.card.definitionId)?.name ?? "Unknown";
      return `• ${name}`;
    });
  }

  private resolveSelectedCard(viewModel: DerivedGameViewModel, selection: ViewModelSelection): TrackedCard | undefined {
    if (selection.type === "tile") {
      const tile = this.findTile(viewModel, selection.id);
      if (!tile) {
        return undefined;
      }
      return {
        card: tile.tile,
        tracker: tile.tracker,
        actionState: "staged",
      };
    }

    return this.findCard(viewModel, selection.id);
  }

  private findTile(viewModel: DerivedGameViewModel, tileId: EntityId): TrackedTile | undefined {
    const key = idToKey(tileId);
    return [...viewModel.worldTiles, ...viewModel.eventTiles, ...viewModel.slotTiles].find(
      (tile) => idToKey(tile.tile.cardId) === key,
    );
  }

  private findCard(viewModel: DerivedGameViewModel, cardId: EntityId): TrackedCard | undefined {
    const key = idToKey(cardId);
    return this.collectAllCards(viewModel).find((trackedCard) => idToKey(trackedCard.card.cardId) === key);
  }

  private drawPanel(x: number, y: number, width: number, height: number, radius: number): Graphics {
    const panel = new Graphics();
    panel.roundRect(x, y, width, height, radius).fill(0x161616);
    panel.roundRect(x, y, width, height, radius).stroke({ color: 0x444444, width: 1 });
    return panel;
  }

  private drawSubPanel(label: string | undefined, x: number, y: number, width: number, height: number): number {
    this.container.addChild(this.drawPanel(x, y, width, height, 6));
    if (!label) {
      return y + 10;
    }
    const title = new Text({
      text: label,
      style: { fill: 0xc9d0d9, fontSize: 11, fontWeight: "bold" },
    });
    title.position.set(x + 8, y + 6);
    this.container.addChild(title);
    return y + 26;
  }

  private drawTitle(text: string, x: number, y: number, maxWidth: number): void {
    const title = new Text({
      text,
      style: {
        fill: 0xe2e2e2,
        fontSize: 16,
        fontWeight: "bold",
        wordWrap: true,
        wordWrapWidth: maxWidth,
      },
    });
    title.position.set(x, y);
    this.container.addChild(title);
  }

  private drawBodyText(lines: string[], x: number, y: number, maxWidth: number): void {
    const text = new Text({
      text: lines.join("\n"),
      style: {
        fill: 0xe2e2e2,
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: maxWidth,
      },
    });
    text.position.set(x, y);
    this.container.addChild(text);
  }

  private formatIdForDisplay(id: EntityId | undefined): string {
    return id === undefined ? "-" : id.toString();
  }
}
