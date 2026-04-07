import { Application } from "pixi.js";
import { GameScene, type GameDataSource } from "./game";
import { createLiveGameDataSource } from "./spacetime/live_game_data_source";

const ROOT_ID = "app";

void boot();

async function boot(): Promise<void> {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    throw new Error(`Missing root container #${ROOT_ID}`);
  }

  const app = new Application();
  await app.init({
    antialias: true,
    autoDensity: true,
    backgroundAlpha: 1,
    backgroundColor: 0x0f1115,
    resizeTo: window,
  });

  root.style.margin = "0";
  root.style.width = "100vw";
  root.style.height = "100vh";
  root.style.overflow = "hidden";
  document.body.style.margin = "0";
  document.body.style.background = "#0f1115";
  root.appendChild(app.canvas);

  const scene = new GameScene({
    width: window.innerWidth,
    height: window.innerHeight,
    playerId: 1n,
    dataSource: createGameDataSource(1n),
  });
  app.stage.addChild(scene);

  const onResize = (): void => {
    scene.resize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", onResize);
  onResize();

  const shutdown = (): void => {
    window.removeEventListener("resize", onResize);
    scene.destroy({ children: true });
    app.destroy(true, { children: true, texture: true });
  };

  window.addEventListener("beforeunload", shutdown, { once: true });
}

function createGameDataSource(playerId: bigint): GameDataSource {
  return createLiveGameDataSource({
    playerId,
    uri: import.meta.env.VITE_SPACETIME_URI,
    moduleName: import.meta.env.VITE_SPACETIME_DB ?? import.meta.env.VITE_SPACETIME_MODULE,
    token: import.meta.env.VITE_SPACETIME_TOKEN,
  });
}
