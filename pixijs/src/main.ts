import { Application, Container, Graphics } from "pixi.js";

import { getDebugInventoryCards } from "./ui/debugCards";
import { computePanelLayout, type LayoutRect, type PanelId } from "./ui/layout";
import { computeInventoryCardLayoutRects } from "./ui/cardLayout";
import { createCardView } from "./ui/cardRenderer";
import { drawPanel } from "./ui/panelRenderer";
import { drawWorldBoardDebugTiles } from "./ui/worldBoardDebug";

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
  app.stage.addChild(panelGraphics);
  app.stage.addChild(worldLayer);
  app.stage.addChild(cardLayer);

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

  resizeApp();
}

void bootstrap();
