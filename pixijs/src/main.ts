import { Application, Container, Graphics, Text } from "pixi.js";

import { DbConnection } from "./spacetime/bindings";
import { getDebugInventoryCards } from "./ui/debugCards";
import { computePanelLayout, type LayoutRect, type PanelId } from "./ui/layout";
import { computeInventoryCardLayoutRects } from "./ui/cardLayout";
import { createCardView } from "./ui/cardRenderer";
import { drawPanel } from "./ui/panelRenderer";
import { drawWorldBoardDebugTiles } from "./ui/worldBoardDebug";

interface ClientViewState {
  observer_id: number;
  view_id: number;
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById("app");

  if (!root) {
    throw new Error("Missing #app root element");
  }

  document.documentElement.style.width = "100%";
  document.documentElement.style.height = "100%";
  document.body.style.margin = "0";
  document.body.style.width = "100%";
  document.body.style.height = "100%";

  root.style.width = "100vw";
  root.style.height = "100vh";
  root.style.overflow = "hidden";

  const app = new Application();
  await app.init({
    antialias: true,
    background: 0x0b111b,
    width: Math.max(1, root.clientWidth),
    height: Math.max(1, root.clientHeight),
  });

  root.appendChild(app.canvas);
  app.canvas.style.display = "block";

  const panelGraphics = new Graphics();
  const cardLayer = new Container();
  const worldLayer = new Container();
  const titleText = new Text({
    text: "",
    style: {
      fill: 0xdbe6f7,
      fontSize: 14,
      fontFamily: "monospace",
    },
  });

  app.stage.addChild(panelGraphics);
  app.stage.addChild(worldLayer);
  app.stage.addChild(cardLayer);
  app.stage.addChild(titleText);

  const viewState: ClientViewState = {
    observer_id: 0,
    view_id: 0,
  };

  let viewInitialized = false;

  const initializeView = (viewId: number): void => {
    viewState.view_id = viewId;
    viewInitialized = true;
    console.debug("[spacetime] view initialized", { view_id: viewState.view_id });
  };

  const updateTitleBar = (titlePanelRect: LayoutRect): void => {
    titleText.text = `observer: ${viewState.observer_id || 0}, viewed: ${viewState.view_id || 0}`;
    titleText.x = titlePanelRect.x + Math.max(8, titlePanelRect.height * 0.18);
    titleText.y = titlePanelRect.y + Math.max(2, titlePanelRect.height * 0.2);
  };

  const redrawLayout = (): void => {
    const screenWidth = app.screen.width;
    const screenHeight = app.screen.height;
    const panelPadding = screenHeight / 240;
    const cardPadding = screenHeight / 240;

    const layoutRects = computePanelLayout(screenWidth, screenHeight);
    const layoutById = new Map<PanelId, LayoutRect>(layoutRects.map((rect) => [rect.id, rect]));

    panelGraphics.clear();
    cardLayer.removeChildren();
    worldLayer.removeChildren();

    for (const layoutRect of layoutRects) {
      drawPanel(panelGraphics, layoutRect, panelPadding);
    }

    const titlePanelRect = layoutById.get("titlePanel");

    if (titlePanelRect) {
      updateTitleBar(titlePanelRect);
    }

    const worldPanelRect = layoutById.get("worldPanel");

    if (worldPanelRect) {
      drawWorldBoardDebugTiles(worldLayer, worldPanelRect, screenHeight);
    }

    const debugCardsByPanel = getDebugInventoryCards();

    for (const [panelId, cards] of Object.entries(debugCardsByPanel)) {
      const panelRect = layoutById.get(panelId as PanelId);

      if (!panelRect || cards.length === 0) {
        continue;
      }

      const cardLayoutRects = computeInventoryCardLayoutRects(
        panelRect,
        cards.length,
        screenWidth,
        screenHeight,
      );

      for (let index = 0; index < cards.length; index += 1) {
        const cardData = cards[index];
        const cardLayoutRect = cardLayoutRects[index];

        if (!cardData || !cardLayoutRect) {
          continue;
        }

        const cardView = createCardView(cardData, cardLayoutRect, cardPadding, screenHeight);
        cardLayer.addChild(cardView);
      }
    }
  };

  const syncObservedPlayer = (cardId: number, event: "received" | "updated"): void => {
    console.debug("[spacetime] matching player row received", { event, card_id: cardId, name: "player1" });
    viewState.observer_id = cardId;
    console.debug("[spacetime] observer_id assigned", { observer_id: viewState.observer_id });

    if (!viewInitialized) {
      initializeView(viewState.observer_id);
    } else {
      viewState.view_id = viewState.observer_id;
    }

    redrawLayout();
  };

  const spacetimeUri = (import.meta.env.VITE_SPACETIMEDB_URI as string | undefined) ?? "ws://localhost:3000";
  const spacetimeDatabase = (import.meta.env.VITE_SPACETIMEDB_DATABASE as string | undefined) ?? "respoiler";

  const connection = DbConnection.builder()
    .withUri(spacetimeUri)
    .withDatabaseName(spacetimeDatabase)
    .onConnect((dbConnection) => {
      console.debug("[spacetime] subscription created", {
        query: "select * from players where name == 'player1'",
      });

      dbConnection.db.players.onInsert((_ctx, row) => {
        if (row.name !== "player1") {
          return;
        }

        syncObservedPlayer(row.cardId, "received");
      });

      dbConnection.db.players.onUpdate((_ctx, oldRow, row) => {
        if (row.name !== "player1" && oldRow.name !== "player1") {
          return;
        }

        console.debug("[spacetime] player row updated", {
          previous_card_id: oldRow.cardId,
          card_id: row.cardId,
          name: row.name,
        });
        syncObservedPlayer(row.cardId, "updated");
      });

      dbConnection.db.players.onDelete((_ctx, row) => {
        if (row.name !== "player1") {
          return;
        }

        console.debug("[spacetime] player row removed", { name: row.name, card_id: row.cardId });
        viewState.observer_id = 0;
        viewState.view_id = 0;
        redrawLayout();
      });

      dbConnection
        .subscriptionBuilder()
        .subscribe("select * from players where name == 'player1'");
    })
    .onConnectError((_ctx, error) => {
      console.error("[spacetime] connection error", error);
    })
    .onDisconnect((error) => {
      console.warn("[spacetime] disconnected", error);
    })
    .build();

  const resizeApp = (): void => {
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    app.renderer.resize(width, height);
    redrawLayout();
  };

  const resizeObserver = new ResizeObserver(() => {
    resizeApp();
  });

  resizeObserver.observe(root);
  window.addEventListener("resize", resizeApp);

  window.addEventListener("beforeunload", () => {
    connection.disconnect();
  });

  resizeApp();
}

void bootstrap();
