import { Application } from "pixi.js";
import { GameScene } from "./game";
import { CardDefinitionStore } from "./game/data/card_definition_store";
import { TileDefinitionStore } from "./game/data/tile_definition_store";
import { getSpacetimeConnection, initSpacetimeClient } from "./spacetime";
import { initPlayerRootSubscription } from "./spacetime/playerRootSubscription";
import { ViewedCardsDataSource } from "./spacetime/viewedCardsDataSource";

const ROOT_ID = "app";

void boot();

async function boot(): Promise<void> {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    throw new Error(`Missing root container #${ROOT_ID}`);
  }

  const connection = initSpacetimeClient();
  console.info("[ui-debug] boot connection status", {
    hasConnection: connection !== null,
    isActiveConnection: connection !== null && connection === getSpacetimeConnection(),
  });

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

  const viewedCardsDataSource = new ViewedCardsDataSource(connection);

  let cardDefinitionStore: CardDefinitionStore | undefined;
  let tileDefinitionStore: TileDefinitionStore | undefined;
  try {
    cardDefinitionStore = await CardDefinitionStore.load();
  } catch (error) {
    console.warn("[ui-debug] failed to load static card definitions", error);
  }

  try {
    tileDefinitionStore = await TileDefinitionStore.load();
  } catch (error) {
    console.warn("[ui-debug] failed to load static tile definitions", error);
  }

  const scene = new GameScene({
    width: window.innerWidth,
    height: window.innerHeight,
    playerId: 1n,
    definitionLookup: cardDefinitionStore?.getLookup(),
    tileDefinitionLookup: tileDefinitionStore?.getLookup(),
    dataSource: viewedCardsDataSource,
    onViewedCardIdChange: (viewedCardId) => {
      viewedCardsDataSource.setViewedCardId(
        typeof viewedCardId === "bigint" ? viewedCardId : BigInt(viewedCardId),
      );
    },
  });
  app.stage.addChild(scene);

  const onResize = (): void => {
    scene.resize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener("resize", onResize);
  onResize();

  const disposePlayerRootSubscription = connection
    ? initPlayerRootSubscription({
        connection,
        onIdsResolved: ({ observerId, viewedId }) => {
          console.info("[ui-debug] ids resolved from player subscription", { observerId, viewedId });
          scene.setObserverCardId(observerId);
          scene.setViewedCardId(viewedId);
        },
      })
    : undefined;

  const shutdown = (): void => {
    window.removeEventListener("resize", onResize);
    disposePlayerRootSubscription?.();
    viewedCardsDataSource.dispose();
    scene.destroy({ children: true });
    app.destroy(true, { children: true, texture: true });
  };

  window.addEventListener("beforeunload", shutdown, { once: true });
}
