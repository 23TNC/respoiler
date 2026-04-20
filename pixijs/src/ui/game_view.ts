import { Application, Container } from "pixi.js";

import { computePanelLayout, type LayoutRect, type PanelId } from "./panels/layout";
import { DetailsPanel } from "./panels/details_panel";
import { EventPanel } from "./panels/event_panel";
import { InventoryPanel } from "./panels/inventory_panel";
import { Panel } from "./panels/panel";
import { SlotPanel } from "./panels/slot_panel";
import { WorldBoardPanel } from "./panels/world_board_panel";

export interface GameViewData {
  // Card rendering is sourced directly from spacetime/data.ts client_cards.
}

interface GameViewOptions {
  app: Application;
  viewedId: number;
  initialData?: Partial<GameViewData>;
}

export class GameView {
  private readonly app: Application;
  private readonly viewedId: number;
  private readonly panelLayer: Container;
  private readonly panelById: Partial<Record<PanelId, Panel>>;

  constructor(options: GameViewOptions) {
    this.app = options.app;
    this.viewedId = options.viewedId;
    this.panelLayer = new Container();
    this.panelById = {};

    this.app.stage.label = `game-view:${this.viewedId}`;
    this.app.stage.addChild(this.panelLayer);
  }

  setData(_data: Partial<GameViewData>): void {
    // Rendering now reads directly from global client_cards state.
    this.render();
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    this.render();
  }

  render(): void {
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const panelPadding = screenHeight / 240;

    const layoutRects = computePanelLayout(screenWidth, screenHeight);
    this.syncPanelInstances(layoutRects, panelPadding);

    for (const layoutRect of layoutRects) {
      const panel = this.panelById[layoutRect.id];
      if (!panel) {
        continue;
      }

      panel.setLayout(layoutRect, panelPadding);
      panel.refresh(screenWidth, screenHeight);
    }
  }

  private syncPanelInstances(layoutRects: LayoutRect[], panelPadding: number): void {
    const existingPanels = new Set(this.panelLayer.children);

    for (const layoutRect of layoutRects) {
      let panel = this.panelById[layoutRect.id];

      if (!panel) {
        panel = this.createPanel(layoutRect, panelPadding);
        this.panelById[layoutRect.id] = panel;
      }

      if (panel && !panel.root.parent) {
        this.panelLayer.addChild(panel.root);
      }

      if (panel) {
        existingPanels.delete(panel.root);
      }
    }

    for (const stalePanelRoot of existingPanels) {
      stalePanelRoot.removeFromParent();
    }
  }

  private createPanel(layoutRect: LayoutRect, panelPadding: number): Panel {
    switch (layoutRect.id) {
      case "worldPanel":
        return new WorldBoardPanel(layoutRect, panelPadding);
      case "disciplinesPanel":
        return new InventoryPanel(layoutRect, panelPadding, 1);
      case "facultiesPanel":
        return new InventoryPanel(layoutRect, panelPadding, 2);
      case "requisitesPanel":
        return new InventoryPanel(layoutRect, panelPadding, 3);
      case "reveriesPanel":
        return new InventoryPanel(layoutRect, panelPadding, 4);
      case "soulsPanel":
        return new InventoryPanel(layoutRect, panelPadding, 5);
      case "detailsPanel":
        return new DetailsPanel(layoutRect, panelPadding);
      case "eventPanel":
        return new EventPanel(layoutRect, panelPadding);
      case "slotPanel":
        return new SlotPanel(layoutRect, panelPadding);
      case "titlePanel":
      default:
        return new Panel(layoutRect, panelPadding);
    }
  }
}
