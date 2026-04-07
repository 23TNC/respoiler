import { Container, Graphics, Text } from "pixi.js";
import { GameDataStore, type GameDataSource } from "./data/game_data_store";
import { deriveGameViewModel, idToKey, type DefinitionLookup, type EntityId, type ViewModelSelection } from "./model";
import { DetailsPanelRenderer } from "./renderers/details_panel_renderer";
import { EventColumnRenderer } from "./renderers/event_column_renderer";
import { InventoryRenderer } from "./renderers/inventory_renderer";
import { WorldBoardRenderer } from "./renderers/world_board_renderer";

type GameSceneConfig = {
  width: number;
  height: number;
  playerId: EntityId;
  definitionLookup?: DefinitionLookup;
  dataSource?: GameDataSource;
};

export class GameScene extends Container {
  private readonly dataStore = new GameDataStore();
  private readonly eventRenderer = new EventColumnRenderer();
  private readonly boardRenderer = new WorldBoardRenderer();
  private readonly inventoryRenderer = new InventoryRenderer();
  private readonly detailsRenderer = new DetailsPanelRenderer();

  private readonly widthPx: number;
  private readonly heightPx: number;
  private readonly definitionLookup?: DefinitionLookup;

  private readonly rootPlayerId: EntityId;
  private observerCardId: EntityId = 0n;
  private viewedCardId: EntityId = 0n;
  private selection?: ViewModelSelection;

  private disposeSource?: () => void;

  constructor(config: GameSceneConfig) {
    super();

    this.widthPx = config.width;
    this.heightPx = config.height;
    this.definitionLookup = config.definitionLookup;
    this.rootPlayerId = config.playerId;

    this.initializeFromPlayer(config.playerId);
    this.layoutContainers();

    this.dataStore.onChange(() => this.renderView());
    if (config.dataSource) {
      this.disposeSource = this.dataStore.connect(config.dataSource);
    }

    this.renderView();
  }

  destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.disposeSource?.();
    super.destroy(options);
  }

  setDataSource(dataSource: GameDataSource): void {
    this.disposeSource?.();
    this.disposeSource = this.dataStore.connect(dataSource);
  }

  setViewedCardId(viewedCardId: EntityId): void {
    this.viewedCardId = viewedCardId;
    this.selection = undefined;
    this.renderView();
  }

  setObserverCardId(observerCardId: EntityId): void {
    this.observerCardId = observerCardId;
    this.renderView();
  }

  private initializeFromPlayer(playerId: EntityId): void {
    const player = this.dataStore.getSnapshot().players.find((row) => idToKey(row.playerId) === idToKey(playerId));
    const rootCardId = player?.cardId ?? 0n;

    this.observerCardId = rootCardId;
    this.viewedCardId = rootCardId;
  }

  private layoutContainers(): void {
    const bg = new Graphics();
    bg.rect(0, 0, this.widthPx, this.heightPx).fill(0x101215);
    this.addChild(bg);

    const eventRegion = new Container();
    eventRegion.position.set(80, this.heightPx - 260);
    eventRegion.addChild(this.eventRenderer.container);

    const boardRegion = new Container();
    boardRegion.position.set(this.widthPx * 0.42, this.heightPx * 0.44);
    boardRegion.addChild(this.boardRenderer.container);

    const detailsRegion = new Container();
    detailsRegion.position.set(this.widthPx - 320, 20);
    detailsRegion.addChild(this.detailsRenderer.container);

    const inventoryRegion = new Container();
    inventoryRegion.position.set(24, this.heightPx - 184);
    inventoryRegion.addChild(this.inventoryRenderer.container);

    this.addChild(eventRegion, boardRegion, detailsRegion, inventoryRegion);
  }

  private renderView(): void {
    const snapshot = this.dataStore.getSnapshot();

    if (this.observerCardId === 0n || this.viewedCardId === 0n) {
      const rootPlayer = snapshot.players.find((player) => idToKey(player.playerId) === idToKey(this.rootPlayerId));
      const fallbackPlayer = rootPlayer ?? snapshot.players[0];
      if (fallbackPlayer) {
        this.observerCardId = fallbackPlayer.cardId;
        this.viewedCardId = fallbackPlayer.cardId;
      }
    }

    const viewModel = deriveGameViewModel(
      snapshot,
      this.observerCardId,
      this.viewedCardId,
      this.definitionLookup,
    );

    this.eventRenderer.render({
      tiles: viewModel.eventTiles,
      selectedTileId: this.selection?.type === "tile" ? this.selection.id : undefined,
      onTileSelect: (tileId) => {
        this.selection = { type: "tile", id: tileId };
        this.renderView();
      },
    });

    this.boardRenderer.render({
      tiles: [...viewModel.worldTiles, ...viewModel.slotTiles],
      selectedTileId: this.selection?.type === "tile" ? this.selection.id : undefined,
      onTileSelect: (tileId) => {
        this.selection = { type: "tile", id: tileId };
        this.renderView();
      },
    });

    this.inventoryRenderer.render({
      inventories: viewModel.inventories,
      selectedCardId: this.selection?.type === "card" ? this.selection.id : undefined,
      width: this.widthPx - 360,
      onSelect: (cardId) => {
        this.selection = { type: "card", id: cardId };
        this.renderView();
      },
      onDragStart: (cardId) => {
        this.selection = { type: "card", id: cardId };
      },
      onDragMove: () => {
        // Extension point: live drag ghost / hover highlighting.
      },
      onDragEnd: () => {
        // Extension point: dispatch reducer to update card_tracker.linked_tile_id.
      },
    });

    this.detailsRenderer.render({
      viewModel,
      selection: this.selection,
      width: 300,
      height: this.heightPx - 220,
    });

    this.renderViewedSelfHeader(viewModel.viewedSelfCard?.definition?.title ?? "Viewed Soul");
  }

  private renderViewedSelfHeader(label: string): void {
    const existing = this.getChildByLabel("viewed-self-header", true);
    if (existing) {
      this.removeChild(existing);
      existing.destroy();
    }

    const header = new Container({ label: "viewed-self-header" });
    const panel = new Graphics();
    panel.roundRect(24, 16, 320, 54, 8).fill(0x1d2730);
    panel.roundRect(24, 16, 320, 54, 8).stroke({ color: 0x4d687a, width: 1 });

    const title = new Text({
      text: `${label}  •  Observer ${this.observerCardId}  •  Viewed ${this.viewedCardId}`,
      style: { fill: 0xe8e8e8, fontSize: 14 },
    });
    title.position.set(36, 34);

    header.addChild(panel, title);
    this.addChild(header);
  }
}
