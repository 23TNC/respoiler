import { Container, Graphics, Text } from "pixi.js";
import { GameDataStore, type GameDataSource } from "./data/game_data_store";
import {
  deriveGameViewModel,
  idToKey,
  type DefinitionLookup,
  type EntityId,
  type ViewModelSelection,
} from "./model";
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

  private readonly background = new Graphics();
  private readonly eventFrame = new Graphics();
  private readonly boardFrame = new Graphics();
  private readonly detailsFrame = new Graphics();
  private readonly inventoryFrame = new Graphics();

  private readonly eventRegion = new Container();
  private readonly boardRegion = new Container();
  private readonly detailsRegion = new Container();
  private readonly inventoryRegion = new Container();

  private widthPx: number;
  private heightPx: number;
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
    this.initializeLayout();

    this.dataStore.onChange(() => this.renderView());
    if (config.dataSource) {
      this.disposeSource = this.dataStore.connect(config.dataSource);
    }

    this.resize(config.width, config.height);
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

  resize(width: number, height: number): void {
    this.widthPx = width;
    this.heightPx = height;
    this.layoutContainers();
    this.renderView();
  }

  private initializeFromPlayer(playerId: EntityId): void {
    const player = this.dataStore.getSnapshot().players.find((row) => idToKey(row.playerId) === idToKey(playerId));
    const rootCardId = player?.cardId ?? 0n;

    this.observerCardId = rootCardId;
    this.viewedCardId = rootCardId;
  }

  private initializeLayout(): void {
    this.eventRegion.addChild(this.eventFrame, this.eventRenderer.container);
    this.boardRegion.addChild(this.boardFrame, this.boardRenderer.container);
    this.detailsRegion.addChild(this.detailsFrame, this.detailsRenderer.container);
    this.inventoryRegion.addChild(this.inventoryFrame, this.inventoryRenderer.container);
    this.addChild(
      this.background,
      this.eventRegion,
      this.boardRegion,
      this.detailsRegion,
      this.inventoryRegion,
    );
  }

  private layoutContainers(): void {
    const margin = 16;
    const headerHeight = 84;
    const bottomHeight = Math.min(190, Math.max(160, Math.floor(this.heightPx * 0.26)));
    const usableHeight = Math.max(220, this.heightPx - headerHeight - bottomHeight - margin * 2);
    const leftWidth = Math.max(160, Math.floor(this.widthPx * 0.2));
    const rightWidth = Math.max(260, Math.floor(this.widthPx * 0.24));
    const centerWidth = Math.max(320, this.widthPx - leftWidth - rightWidth - margin * 4);

    this.background.clear();
    this.background.rect(0, 0, this.widthPx, this.heightPx).fill(0x101215);

    this.drawFrame(this.eventFrame, leftWidth, usableHeight, "Events");
    this.drawFrame(this.boardFrame, centerWidth, usableHeight, "World Board");
    this.drawFrame(this.detailsFrame, rightWidth, usableHeight, "Details");
    this.drawFrame(this.inventoryFrame, this.widthPx - margin * 2, bottomHeight, "Inventory");

    this.eventRegion.position.set(margin, headerHeight);
    this.boardRegion.position.set(margin * 2 + leftWidth, headerHeight);
    this.detailsRegion.position.set(margin * 3 + leftWidth + centerWidth, headerHeight);
    this.inventoryRegion.position.set(margin, headerHeight + usableHeight + margin);

    this.eventRenderer.container.position.set(leftWidth * 0.5, usableHeight - 24);
    this.boardRenderer.container.position.set(centerWidth * 0.5, usableHeight * 0.5);
    this.detailsRenderer.container.position.set(0, 0);
    this.inventoryRenderer.container.position.set(0, 0);
  }

  private drawFrame(target: Graphics, width: number, height: number, label: string): void {
    target.clear();
    target.roundRect(0, 0, width, height, 8).fill(0x161a1f);
    target.roundRect(0, 0, width, height, 8).stroke({ color: 0x425468, width: 1 });

    const existingLabel = target.parent?.getChildByLabel(`${label}-label`);
    if (existingLabel) {
      existingLabel.destroy();
    }

    const title = new Text({
      text: label,
      style: { fill: 0xc7d3df, fontSize: 14, fontWeight: "bold" },
    });
    title.label = `${label}-label`;
    title.position.set(10, 10);
    target.parent?.addChild(title);
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
      width: this.inventoryFrame.width,
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
      width: this.detailsFrame.width,
      height: this.detailsFrame.height,
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
    panel.roundRect(16, 16, this.widthPx - 32, 54, 8).fill(0x1d2730);
    panel.roundRect(16, 16, this.widthPx - 32, 54, 8).stroke({ color: 0x4d687a, width: 1 });

    const title = new Text({
      text: `${label}  •  Observer ${this.observerCardId}  •  Viewed ${this.viewedCardId}`,
      style: { fill: 0xe8e8e8, fontSize: 14 },
    });
    title.position.set(30, 34);

    header.addChild(panel, title);
    this.addChild(header);
  }
}
