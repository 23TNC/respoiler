import { Container, Graphics, Text } from "pixi.js";
import { GameDataStore, type GameDataSource } from "./data/game_data_store";
import {
  deriveGameViewModel,
  type DefinitionLookup,
  type EntityId,
  type ViewModelSelection,
} from "./model";
import type { TileDefinitionInfo } from "./data/card_definition_store";
import { DetailsPanelRenderer } from "./renderers/details_panel_renderer";
import { EventColumnRenderer } from "./renderers/event_column_renderer";
import { InventoryRenderer } from "./renderers/inventory_renderer";
import { WorldBoardRenderer } from "./renderers/world_board_renderer";

type GameSceneConfig = {
  width: number;
  height: number;
  playerId: EntityId;
  definitionLookup?: DefinitionLookup;
  tileDefinitionLookup?: (definitionId: EntityId) => TileDefinitionInfo | undefined;
  dataSource?: GameDataSource;
  onViewedCardIdChange?: (viewedCardId: EntityId) => void;
};

export class GameScene extends Container {
  private static readonly PANEL_HEADER_HEIGHT = 34;
  private static readonly PANEL_PADDING = 10;
  private static readonly INVENTORY_SIZE_MULTIPLIER = 0.8;
  private static readonly LAYOUT = {
    margin: 16,
    columnGap: 12,
    rowGap: 12,
    topHeader: {
      outerPadding: 16,
      panelHeight: 28,
      reservedHeight: 44,
      cornerRadius: 8,
    },
    leftEvents: {
      widthRatio: 0.11,
      minWidth: 112,
      maxWidth: 180,
    },
    rightDetails: {
      widthRatio: 0.25,
      minWidth: 260,
      maxWidth: 420,
    },
    bottomInventory: {
      heightRatio: 0.35 * GameScene.INVENTORY_SIZE_MULTIPLIER,
      minHeight: 220 * GameScene.INVENTORY_SIZE_MULTIPLIER,
      maxHeight: 320 * GameScene.INVENTORY_SIZE_MULTIPLIER,
    },
    eventsSplitRatio: 0.6,
  } as const;

  private readonly dataStore = new GameDataStore();
  private readonly eventRenderer = new EventColumnRenderer();
  private readonly boardRenderer = new WorldBoardRenderer();
  private readonly inventoryRenderer = new InventoryRenderer();
  private readonly detailsRenderer = new DetailsPanelRenderer();

  private readonly background = new Graphics();
  private readonly eventTopFrame = new Graphics();
  private readonly eventBottomFrame = new Graphics();
  private readonly eventTopMask = new Graphics();
  private readonly boardFrame = new Graphics();
  private readonly detailsFrame = new Graphics();
  private readonly inventoryFrame = new Graphics();

  private readonly eventRegion = new Container();
  private readonly eventTopRegion = new Container();
  private readonly eventBottomRegion = new Container();
  private readonly boardRegion = new Container();
  private readonly detailsRegion = new Container();
  private readonly inventoryRegion = new Container();

  private widthPx: number;
  private heightPx: number;
  private eventRegionWidth = 0;
  private eventRegionHeight = 0;
  private boardRegionWidth = 0;
  private boardRegionHeight = 0;
  private detailsRegionWidth = 0;
  private detailsRegionHeight = 0;
  private eventTopRegionHeight = 0;
  private eventBottomRegionHeight = 0;
  private inventoryRegionWidth = 0;
  private inventoryRegionHeight = 0;
  private readonly definitionLookup?: DefinitionLookup;
  private readonly tileDefinitionLookup?: (definitionId: EntityId) => TileDefinitionInfo | undefined;

  private observerCardId?: EntityId;
  private viewedCardId?: EntityId;
  private selection?: ViewModelSelection;

  private disposeSource?: () => void;
  private readonly onViewedCardIdChange?: (viewedCardId: EntityId) => void;

  constructor(config: GameSceneConfig) {
    super();

    this.widthPx = config.width;
    this.heightPx = config.height;
    this.definitionLookup = config.definitionLookup;
    this.tileDefinitionLookup = config.tileDefinitionLookup;
    this.onViewedCardIdChange = config.onViewedCardIdChange;
    this.initializeLayout();

    this.dataStore.onChange(() => this.renderView());
    if (config.dataSource) {
      this.disposeSource = this.dataStore.connect(config.dataSource);
    }

    this.resize(config.width, config.height);
    this.scheduleInitialLayoutPass();
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
    console.info("[ui-debug] setViewedCardId called", { viewedCardId });
    this.viewedCardId = viewedCardId;
    this.selection = undefined;
    this.renderView();
    this.onViewedCardIdChange?.(viewedCardId);
  }

  setObserverCardId(observerCardId: EntityId): void {
    console.info("[ui-debug] setObserverCardId called", { observerCardId });
    this.observerCardId = observerCardId;
    this.renderView();
  }

  resize(width: number, height: number): void {
    this.widthPx = width;
    this.heightPx = height;
    this.layoutContainers();
    this.renderView();
  }

  private initializeLayout(): void {
    this.eventTopRegion.addChild(this.eventTopFrame, this.eventTopMask, this.eventRenderer.container);
    this.eventBottomRegion.addChild(this.eventBottomFrame);
    this.eventRegion.addChild(this.eventTopRegion, this.eventBottomRegion);
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
    const { margin, rowGap, columnGap } = GameScene.LAYOUT;
    const headerHeight = GameScene.LAYOUT.topHeader.reservedHeight;
    const middleTop = headerHeight + rowGap;
    const contentWidth = Math.max(360, this.widthPx - margin * 2);

    const inventoryHeight = this.clamp(
      Math.floor(this.heightPx * GameScene.LAYOUT.bottomInventory.heightRatio),
      GameScene.LAYOUT.bottomInventory.minHeight,
      GameScene.LAYOUT.bottomInventory.maxHeight,
    );
    const inventoryTop = this.heightPx - margin - inventoryHeight;
    const usableHeight = Math.max(220, inventoryTop - rowGap - middleTop);

    const leftWidth = this.clamp(
      Math.floor(contentWidth * GameScene.LAYOUT.leftEvents.widthRatio),
      GameScene.LAYOUT.leftEvents.minWidth,
      GameScene.LAYOUT.leftEvents.maxWidth,
    );
    const rightWidth = this.clamp(
      Math.floor(contentWidth * GameScene.LAYOUT.rightDetails.widthRatio),
      GameScene.LAYOUT.rightDetails.minWidth,
      GameScene.LAYOUT.rightDetails.maxWidth,
    );
    const centerWidth = Math.max(280, contentWidth - leftWidth - rightWidth - columnGap * 2);

    this.background.clear();
    this.background.rect(0, 0, this.widthPx, this.heightPx).fill(0x101215);

    this.eventRegionWidth = leftWidth;
    this.eventRegionHeight = usableHeight;
    this.eventTopRegionHeight = Math.floor(this.eventRegionHeight * GameScene.LAYOUT.eventsSplitRatio);
    this.eventBottomRegionHeight = this.eventRegionHeight - this.eventTopRegionHeight;
    this.boardRegionWidth = centerWidth;
    this.boardRegionHeight = usableHeight;
    this.detailsRegionWidth = rightWidth;
    this.detailsRegionHeight = usableHeight;
    this.inventoryRegionWidth = contentWidth;
    this.inventoryRegionHeight = inventoryHeight;

    this.drawFrame(this.eventTopFrame, this.eventRegionWidth, this.eventTopRegionHeight, "Events");
    this.drawFrame(this.eventBottomFrame, this.eventRegionWidth, this.eventBottomRegionHeight);
    this.drawFrame(this.boardFrame, this.boardRegionWidth, this.boardRegionHeight, "World Board");
    this.drawFrame(this.detailsFrame, this.detailsRegionWidth, this.detailsRegionHeight, "Details");
    this.drawFrame(this.inventoryFrame, this.inventoryRegionWidth, this.inventoryRegionHeight);
    this.eventTopMask.clear();
    this.eventTopMask
      .rect(
        GameScene.PANEL_PADDING,
        GameScene.PANEL_HEADER_HEIGHT + GameScene.PANEL_PADDING,
        Math.max(10, this.eventRegionWidth - GameScene.PANEL_PADDING * 2),
        Math.max(
          10,
          this.eventTopRegionHeight - GameScene.PANEL_HEADER_HEIGHT - GameScene.PANEL_PADDING * 2,
        ),
      )
      .fill(0xffffff);
    this.eventRenderer.container.mask = this.eventTopMask;

    this.eventRegion.position.set(margin, middleTop);
    this.eventTopRegion.position.set(0, 0);
    this.eventBottomRegion.position.set(0, this.eventTopRegionHeight);
    this.boardRegion.position.set(margin + leftWidth + columnGap, middleTop);
    this.detailsRegion.position.set(margin + leftWidth + columnGap + centerWidth + columnGap, middleTop);
    this.inventoryRegion.position.set(margin, inventoryTop);

    this.eventRenderer.container.position.set(this.eventRegionWidth * 0.5, this.eventTopRegionHeight - 24);
    this.boardRenderer.container.position.set(this.boardRegionWidth * 0.5, this.boardRegionHeight * 0.5);
    this.detailsRenderer.container.position.set(
      GameScene.PANEL_PADDING,
      GameScene.PANEL_HEADER_HEIGHT + GameScene.PANEL_PADDING,
    );
    this.inventoryRenderer.container.position.set(
      GameScene.PANEL_PADDING,
      GameScene.PANEL_PADDING,
    );
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private drawFrame(target: Graphics, width: number, height: number, label?: string): void {
    target.clear();
    target.roundRect(0, 0, width, height, 8).fill(0x161a1f);
    target.roundRect(0, 0, width, height, 8).stroke({ color: 0x425468, width: 1 });

    const existingLabels = target.parent?.children.filter((child) => child.label?.endsWith("-label")) ?? [];
    for (const existingLabel of existingLabels) {
      existingLabel.destroy();
    }

    if (!label) {
      return;
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
    const resolvedObserverCardId = this.observerCardId ?? 0n;
    const resolvedViewedCardId = this.viewedCardId ?? 0n;

    const viewModel = deriveGameViewModel(
      snapshot,
      resolvedObserverCardId,
      resolvedViewedCardId,
      this.definitionLookup,
    );
    console.info("[ui-debug] rendering ids", {
      observerId: this.observerCardId ?? "-",
      viewedId: this.viewedCardId ?? "-",
    });

    this.eventRenderer.render({
      tiles: viewModel.eventTiles,
      selectedTileId: this.selection?.type === "tile" ? this.selection.id : undefined,
      onTileSelect: (tileId) => {
        this.selection = { type: "tile", id: tileId };
        this.renderView();
      },
    });

    this.boardRenderer.render({
      viewedTile: viewModel.viewedWorldTracker
        ? {
            tileId: resolvedViewedCardId,
            q: viewModel.viewedWorldTracker.q,
            r: viewModel.viewedWorldTracker.r,
            z: viewModel.viewedWorldTracker.z,
          }
        : undefined,
      selectedTileId: this.selection?.type === "tile" ? this.selection.id : undefined,
      onTileSelect: (tileId) => {
        this.selection = { type: "tile", id: tileId };
        this.renderView();
      },
    });
    if (!viewModel.viewedCardTracker) {
      console.info("[ui-debug] world hex render skipped", {
        viewedCardId: resolvedViewedCardId,
        reason: "missing-card-tracker",
      });
    } else if (!viewModel.viewedWorldTracker) {
      console.info("[ui-debug] world hex render skipped", {
        viewedCardId: resolvedViewedCardId,
        cardTracker: viewModel.viewedCardTracker,
        reason: "missing-world-tracker",
      });
    } else {
      console.info("[ui-debug] world hex render ready", {
        viewedCardId: resolvedViewedCardId,
        cardTracker: viewModel.viewedCardTracker,
        tileTracker: viewModel.viewedWorldTracker,
      });
    }

    this.inventoryRenderer.render({
      inventories: viewModel.inventories,
      selectedCardId: this.selection?.type === "card" ? this.selection.id : undefined,
      width: Math.max(120, this.inventoryRegionWidth - GameScene.PANEL_PADDING * 2),
      height: Math.max(80, this.inventoryRegionHeight - GameScene.PANEL_PADDING * 2),
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
        // Extension point: dispatch reducer to update card_tracker.linked_card_id.
      },
    });

    this.detailsRenderer.render({
      viewModel,
      observerCardId: this.observerCardId,
      viewedCardId: this.viewedCardId,
      selection: this.selection,
      definitionLookup: this.definitionLookup,
      tileDefinitionLookup: this.tileDefinitionLookup,
      width: Math.max(120, this.detailsRegionWidth - GameScene.PANEL_PADDING * 2),
      height: Math.max(80, this.detailsRegionHeight - GameScene.PANEL_HEADER_HEIGHT - GameScene.PANEL_PADDING * 2),
    });

    this.renderViewedSelfHeader(viewModel.viewedSelfCard?.definition?.name ?? "Viewed Soul");
  }

  private renderViewedSelfHeader(label: string): void {
    const existing = this.getChildByLabel("viewed-self-header", true);
    if (existing) {
      this.removeChild(existing);
      existing.destroy();
    }

    const { outerPadding, panelHeight, cornerRadius } = GameScene.LAYOUT.topHeader;
    const header = new Container({ label: "viewed-self-header" });
    const panel = new Graphics();
    panel.roundRect(outerPadding, outerPadding, this.widthPx - outerPadding * 2, panelHeight, cornerRadius).fill(0x1d2730);
    panel
      .roundRect(outerPadding, outerPadding, this.widthPx - outerPadding * 2, panelHeight, cornerRadius)
      .stroke({ color: 0x4d687a, width: 1 });

    const title = new Text({
      text: `${label}  •  Observer ${this.formatIdForDisplay(this.observerCardId)}  •  Viewed ${this.formatIdForDisplay(this.viewedCardId)}`,
      style: { fill: 0xe8e8e8, fontSize: 13 },
    });
    title.anchor.set(0, 0.5);
    title.position.set(outerPadding + 12, outerPadding + panelHeight * 0.5);

    header.addChild(panel, title);
    this.addChild(header);
  }

  private scheduleInitialLayoutPass(): void {
    if (typeof window === "undefined") {
      return;
    }

    window.requestAnimationFrame(() => {
      this.layoutContainers();
      this.renderView();
    });
  }

  private formatIdForDisplay(id: EntityId | undefined): string {
    return id === undefined ? "-" : id.toString();
  }
}
