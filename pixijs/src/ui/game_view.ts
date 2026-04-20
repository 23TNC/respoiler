import { Application, Container, Rectangle } from "pixi.js";

import { InputManager } from "./input/input_manager";
import { InteractionResolver } from "./input/interaction_resolver";
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
  private readonly inputManager: InputManager;

  constructor(options: GameViewOptions) {
    this.app = options.app;
    this.viewedId = options.viewedId;
    this.panelLayer = new Container();
    this.panelById = {};
    this.inputManager = new InputManager({
      interactionResolver: new InteractionResolver({
        onStateChanged: () => this.render(),
      }),
    });

    this.app.stage.label = `game-view:${this.viewedId}`;
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.app.stage.addChild(this.panelLayer);
    this.app.stage.on("pointerdown", (event) => this.inputManager.onPointerDown(event));
    this.app.stage.on("pointermove", (event) => this.inputManager.onPointerMove(event));
    this.app.stage.on("pointerup", (event) => this.inputManager.onPointerUp(event));
    this.app.stage.on("pointerupoutside", (event) => this.inputManager.onPointerUp(event));
  }

  setData(_data: Partial<GameViewData>): void {
    // Rendering now reads directly from global client_cards state.
    this.render();
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
    this.app.stage.hitArea = new Rectangle(0, 0, this.app.screen.width, this.app.screen.height);
    this.render();
  }

  render(): void {
    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const panelPadding = screenHeight / 240;

    const layoutRects = computePanelLayout(screenWidth, screenHeight);
    this.syncPanelInstances(layoutRects, panelPadding);
    this.syncInputPanels(layoutRects);

    for (const layoutRect of layoutRects) {
      const panel = this.panelById[layoutRect.id];
      if (!panel) {
        continue;
      }

      panel.setLayout(layoutRect, panelPadding);
      panel.refresh(screenWidth, screenHeight);
    }
  }

  private syncInputPanels(layoutRects: LayoutRect[]): void {
    this.inputManager.clearPanels();

    for (const layoutRect of layoutRects) {
      const panel = this.panelById[layoutRect.id];
      if (!panel) {
        continue;
      }

      this.inputManager.registerPanel(panel.getInputRegistration(getPanelInputPriority(layoutRect.id)));
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

function getPanelInputPriority(panelId: PanelId): number {
  switch (panelId) {
    case "eventPanel":
    case "slotPanel":
      return 30;
    case "detailsPanel":
      return 20;
    case "worldPanel":
      return 10;
    case "disciplinesPanel":
    case "facultiesPanel":
    case "requisitesPanel":
    case "reveriesPanel":
    case "soulsPanel":
      return 5;
    case "titlePanel":
    default:
      return 0;
  }
}
