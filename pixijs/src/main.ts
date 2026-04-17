import { Application, Graphics } from "pixi.js";

import { computePanelLayout } from "./ui/layout";
import { drawPanel } from "./ui/panelRenderer";

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
  app.stage.addChild(panelGraphics);

  const redrawLayout = (): void => {
    const screenWidth = app.screen.width;
    const screenHeight = app.screen.height;
    const padding = screenHeight / 120;

    const layoutRects = computePanelLayout(screenWidth, screenHeight);

    panelGraphics.clear();
    for (const layoutRect of layoutRects) {
      drawPanel(panelGraphics, layoutRect, padding);
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
