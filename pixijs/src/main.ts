import { Application, Container, Graphics, Text } from "pixi.js";

import { initializeSpacetimeClient } from "./spacetime/client";
import type { Zone } from "./spacetime/bindings/types";
import { loadCardDefinitions } from "./spacetime/cardDefinitions";
import { computePanelLayout, type LayoutRect, type PanelId } from "./ui/layout";
import { computeInventoryCardLayoutRects } from "./ui/cardLayout";
import { createCardView, setCardSelected } from "./ui/cardRenderer";
import { computePanelInnerRect, drawPanel } from "./ui/panelRenderer";
import { drawWorldBoardDebugTiles } from "./ui/worldBoardDebug";
import { setHexCardSelected } from "./ui/hexCardRenderer";
import { InteractionManager } from "./ui/interactionManager";

interface ClientViewState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  current_zone_id: number;
  visible_zone_ids: number[];
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
  const worldTileLayer = new Container();
  const worldTileMask = new Graphics();
  const titleText = new Text({
    text: "",
    style: {
      fill: 0xdbe6f7,
      fontSize: 14,
      fontFamily: "monospace",
    },
  });

  worldLayer.addChild(worldTileMask);
  worldLayer.addChild(worldTileLayer);
  worldTileLayer.mask = worldTileMask;

  app.stage.addChild(panelGraphics);
  app.stage.addChild(worldLayer);
  app.stage.addChild(cardLayer);
  app.stage.addChild(titleText);

  const interactionManager = new InteractionManager({ stage: app.stage });

  const viewState: ClientViewState = {
    observer_id: 0,
    viewed_id: 0,
    world_q: 0,
    world_r: 0,
    view_z: 0,
    current_zone_id: 0,
    visible_zone_ids: [],
  };

  const updateTitleBar = (titlePanelRect: LayoutRect): void => {
    titleText.text = `observer: ${viewState.observer_id || 0}, viewed: ${viewState.viewed_id || 0}, q: ${viewState.world_q || 0}, r: ${viewState.world_r || 0}, z: ${viewState.view_z || 0}`;
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
    interactionManager.clear();
    cardLayer.removeChildren();
    worldTileLayer.removeChildren();

    for (const layoutRect of layoutRects) {
      drawPanel(panelGraphics, layoutRect, panelPadding);
    }

    const titlePanelRect = layoutById.get("titlePanel");

    if (titlePanelRect) {
      updateTitleBar(titlePanelRect);
    }

    const worldPanelRect = layoutById.get("worldPanel");

    if (worldPanelRect) {
      const worldPanelInnerRect = computePanelInnerRect(worldPanelRect, panelPadding);
      const visibleZoneRows: Zone[] = viewState.visible_zone_ids
        .map((zoneId) => spacetimeClient.state.cached_zone.get(zoneId))
        .filter((zoneRow): zoneRow is Zone => zoneRow !== undefined);
      worldTileMask
        .clear()
        .rect(
          worldPanelInnerRect.x,
          worldPanelInnerRect.y,
          worldPanelInnerRect.width,
          worldPanelInnerRect.height,
        )
        .fill({ color: 0xffffff, alpha: 1 });

      drawWorldBoardDebugTiles(
        worldTileLayer,
        worldPanelInnerRect,
        screenHeight,
        visibleZoneRows,
        viewState.world_q,
        viewState.world_r,
        (hexTileView, tileInfo) => {
          interactionManager.registerHexTile(
            hexTileView,
            {
              kind: "hex-card",
              tile_id: tileInfo.tile_id,
              definition: tileInfo.definition,
              world_q: tileInfo.world_q,
              world_r: tileInfo.world_r,
            },
            (selected) => {
              setHexCardSelected(hexTileView, selected);
            },
          );
        },
      );
    } else {
      worldTileMask.clear();
    }

    const inventoryCardsByPanel = spacetimeClient.state.inventory_cards;

    for (const [panelId, cards] of Object.entries(inventoryCardsByPanel)) {
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
        interactionManager.registerRectCard(
          cardView,
          {
            kind: "rect-card",
            card_id: cardData.id,
            definition: cardData.name,
          },
          (selected) => {
            setCardSelected(cardView, selected);
          },
        );
      }
    }
  };

  await loadCardDefinitions();

  const spacetimeUri = (import.meta.env.VITE_SPACETIMEDB_URI as string | undefined) ?? "ws://localhost:3000";
  const spacetimeDatabase = (import.meta.env.VITE_SPACETIMEDB_DATABASE as string | undefined) ?? "respoiler";

  const spacetimeClient = initializeSpacetimeClient({
    uri: spacetimeUri,
    databaseName: spacetimeDatabase,
    observedPlayerName: "player1",
    onStateChanged: (state) => {
      viewState.observer_id = state.observer_id;
      viewState.viewed_id = state.viewed_id;
      viewState.world_q = state.world_q;
      viewState.world_r = state.world_r;
      viewState.view_z = state.view_z;
      viewState.current_zone_id = state.current_zone_id;
      viewState.visible_zone_ids = [...state.visible_zone_ids];
      redrawLayout();
    },
  });

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
    spacetimeClient.disconnect();
  });

  resizeApp();
}

void bootstrap();
