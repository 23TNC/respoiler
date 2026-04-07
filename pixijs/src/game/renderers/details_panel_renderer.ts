import { Container, Graphics, Text } from "pixi.js";
import type { DerivedGameViewModel, EntityId, TrackedCard, TrackedTile, ViewModelSelection } from "../model";
import { idToKey } from "../model";

type DetailsPanelParams = {
  viewModel: DerivedGameViewModel;
  selection?: ViewModelSelection;
  width: number;
  height: number;
};

export class DetailsPanelRenderer {
  readonly container = new Container();

  render(params: DetailsPanelParams): void {
    this.container.removeChildren();

    const bg = new Graphics();
    bg.roundRect(0, 0, params.width, params.height, 8).fill(0x161616);
    bg.roundRect(0, 0, params.width, params.height, 8).stroke({ color: 0x444444, width: 1 });
    this.container.addChild(bg);

    const lines = this.buildLines(params.viewModel, params.selection);
    const text = new Text({
      text: lines.join("\n"),
      style: {
        fill: 0xe2e2e2,
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: params.width - 20,
      },
    });
    text.position.set(10, 10);
    this.container.addChild(text);
  }

  private buildLines(viewModel: DerivedGameViewModel, selection?: ViewModelSelection): string[] {
    const lines: string[] = [
      "Details",
      `Observer: ${viewModel.observerCardId}`,
      `Viewed: ${viewModel.viewedCardId}`,
      "",
    ];

    if (!selection) {
      lines.push("Select a tile or card.");
      return lines;
    }

    if (selection.type === "tile") {
      const tile = this.findTile(viewModel, selection.id);
      if (!tile) {
        lines.push(`Tile ${selection.id} not found.`);
        return lines;
      }
      lines.push(`Tile #${tile.tile.tileId}`);
      lines.push(`Type: ${tile.tile.tileType}`);
      if (tile.tracker) {
        lines.push(`Position: q=${tile.tracker.q}, r=${tile.tracker.r}, z=${tile.tracker.z}`);
      }
      lines.push(`Attached cards: ${tile.attachedCards.length}`);
      tile.attachedCards.slice(0, 6).forEach((trackedCard) => {
        lines.push(`  • ${trackedCard.definition?.title ?? trackedCard.card.cardType} (${trackedCard.actionState})`);
      });
      return lines;
    }

    const card = this.findCard(viewModel, selection.id);
    if (!card) {
      lines.push(`Card ${selection.id} not found.`);
      return lines;
    }

    lines.push(`Card #${card.card.cardId}`);
    lines.push(`Type: ${card.card.cardType}`);
    lines.push(`Title: ${card.definition?.title ?? "Unknown definition"}`);
    lines.push(`Action state: ${card.actionState}`);
    lines.push(`Position lock: ${card.tracker?.positionLock ? "yes" : "no"}`);
    lines.push(`Position hold: ${card.tracker?.positionHold ? "yes" : "no"}`);
    lines.push(`Linked tile: ${card.tracker?.linkedTileId ?? 0}`);

    return lines;
  }

  private findTile(viewModel: DerivedGameViewModel, tileId: EntityId): TrackedTile | undefined {
    const key = idToKey(tileId);
    return [...viewModel.worldTiles, ...viewModel.eventTiles, ...viewModel.slotTiles].find(
      (tile) => idToKey(tile.tile.tileId) === key,
    );
  }

  private findCard(viewModel: DerivedGameViewModel, cardId: EntityId): TrackedCard | undefined {
    const key = idToKey(cardId);
    const allCards = [
      ...(viewModel.viewedSelfCard ? [viewModel.viewedSelfCard] : []),
      ...viewModel.worldTiles.flatMap((tile) => tile.attachedCards),
      ...viewModel.eventTiles.flatMap((tile) => tile.attachedCards),
      ...viewModel.slotTiles.flatMap((tile) => tile.attachedCards),
      ...Object.values(viewModel.inventories).flat(),
    ];
    return allCards.find((trackedCard) => idToKey(trackedCard.card.cardId) === key);
  }
}
