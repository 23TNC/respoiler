import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";

import { initializeSpacetimeClient } from "./spacetime/client";
import type { Zone } from "./spacetime/bindings/types";
import { loadCardDefinitions } from "./spacetime/cardDefinitions";
import type { InventoryCard } from "./spacetime/inventory";
import { packedZoneAndPositionToWorld, worldToZone } from "./spacetime/zoneMath";
import { computePanelLayout, type LayoutRect, type PanelId } from "./ui/layout";
import { computeInventoryCardLayoutRects } from "./ui/cardLayout";
import { createCardView, setCardSelected } from "./ui/cardRenderer";
import { buildDetailsPanelData, renderDetailsPanel } from "./ui/detailsPanel";
import { computePanelInnerRect, drawPanel } from "./ui/panelRenderer";
import { drawWorldBoardDebugTiles } from "./ui/worldBoardDebug";
import { setHexCardSelected } from "./ui/hexCardRenderer";
import { InteractionManager, type InteractableMetadata } from "./ui/interactionManager";

interface ClientViewState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  current_zone_id: number;
  visible_zone_ids: number[];
}

const createSelectionCardFromMetadata = (
  metadata: InteractableMetadata,
  viewedId: number,
): InventoryCard | null => {
  if (metadata.card_type === 6) {
    const worldQ = metadata.world_q ?? 0;
    const worldR = metadata.world_r ?? 0;
    const worldZ = metadata.z ?? 0;
    const zoneInfo = worldToZone(worldQ, worldR, worldZ);
    const localQ = worldQ - (zoneInfo.zoneQ * 8);
    const localR = worldR - (zoneInfo.zoneR * 8);

    return {
      id: metadata.tile_id ?? metadata.card_id ?? "tile",
      card_id: Number.parseInt(metadata.card_id ?? "0", 10),
      card_type: 6,
      linked: metadata.linked ?? viewedId,
      zone: metadata.zone ?? zoneInfo.zoneId,
      position: metadata.position ?? (((localQ & 0x07) << 3) | (localR & 0x07)),
      name: metadata.name ?? metadata.definition ?? "Unknown Tile",
      colors: [0x365486, 0x242f4f, 0xf4f8ff],
      progress: 0,
      progressDirection: "clockwise",
      progressFillColor: 0,
      progressEmptyColor: 0,
    };
  }

  if (!metadata.card_id || !metadata.card_type) {
    return null;
  }

  return {
    id: metadata.card_id,
    card_id: Number.parseInt(metadata.card_id, 10),
    card_type: metadata.card_type,
    linked: metadata.linked ?? viewedId,
    zone: metadata.zone ?? 0,
    position: metadata.position ?? 0,
    name: metadata.name ?? metadata.definition ?? `Card ${metadata.card_id}`,
    colors: [0, 0, 0],
    progress: 0,
    progressDirection: "clockwise",
    progressFillColor: 0,
    progressEmptyColor: 0,
  };
};

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
  const detailsLayer = new Container();
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
  app.stage.addChild(detailsLayer);
  app.stage.addChild(titleText);

  const viewState: ClientViewState = {
    observer_id: 0,
    viewed_id: 0,
    world_q: 0,
    world_r: 0,
    view_z: 0,
    current_zone_id: 0,
    visible_zone_ids: [],
  };

  let selectedDetailsCard: InventoryCard | null = null;

  const metadataMatchesSelectedCard = (metadata: InteractableMetadata): boolean => {
    if (!selectedDetailsCard) {
      return false;
    }

    if (selectedDetailsCard.card_type === 6) {
      if (metadata.card_type !== 6) {
        return false;
      }

      const selectedWorld = packedZoneAndPositionToWorld(selectedDetailsCard.zone, selectedDetailsCard.position);
      return metadata.world_q === selectedWorld.worldQ
        && metadata.world_r === selectedWorld.worldR
        && metadata.z === selectedWorld.z;
    }

    return metadata.card_type === selectedDetailsCard.card_type
      && Number.parseInt(metadata.card_id ?? "-1", 10) === selectedDetailsCard.card_id;
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
    detailsLayer.removeChildren();

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
      interactionManager.setWorldDropBounds(
        new Rectangle(
          worldPanelInnerRect.x,
          worldPanelInnerRect.y,
          worldPanelInnerRect.width,
          worldPanelInnerRect.height,
        ),
      );
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
          const zoneInfo = worldToZone(tileInfo.world_q, tileInfo.world_r, viewState.view_z);
          const localQ = tileInfo.world_q - (zoneInfo.zoneQ * 8);
          const localR = tileInfo.world_r - (zoneInfo.zoneR * 8);
          interactionManager.registerHexTile(
            hexTileView,
            {
              kind: "hex-card",
              card_type: 6,
              tile_id: tileInfo.tile_id,
              name: tileInfo.definition,
              definition: tileInfo.definition,
              world_q: tileInfo.world_q,
              world_r: tileInfo.world_r,
              z: viewState.view_z,
              linked: viewState.viewed_id,
              zone: zoneInfo.zoneId,
              position: ((localQ & 0x07) << 3) | (localR & 0x07),
            },
            (selected) => {
              setHexCardSelected(hexTileView, selected);
            },
          );
        },
      );
    } else {
      interactionManager.setWorldDropBounds(null);
      worldTileMask.clear();
    }

    const inventoryCardsByPanel = spacetimeClient.state.inventory_cards;
    const allOwnedCards = Object.values(inventoryCardsByPanel).flat();

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
            card_type: cardData.card_type,
            linked: cardData.linked,
            zone: cardData.zone,
            position: cardData.position,
            name: cardData.name,
            definition: cardData.name,
          },
          (selected) => {
            setCardSelected(cardView, selected);
          },
        );
      }
    }

    if (selectedDetailsCard) {
      interactionManager.restoreSelection(metadataMatchesSelectedCard);
    }

    const detailsPanelRect = layoutById.get("detailsPanel");
    if (!detailsPanelRect) {
      return;
    }

    const detailsPanelInnerRect = computePanelInnerRect(detailsPanelRect, panelPadding);
    const normalizedSelection = selectedDetailsCard
      ? (
        selectedDetailsCard.card_type === 6
          ? selectedDetailsCard
          : allOwnedCards.find((card) => card.card_id === selectedDetailsCard.card_id) ?? null
      )
      : null;
    const detailsData = buildDetailsPanelData(normalizedSelection, allOwnedCards, viewState.viewed_id);
    renderDetailsPanel(detailsLayer, detailsPanelInnerRect, detailsData, screenHeight);
  };

  const interactionManager = new InteractionManager({
    stage: app.stage,
    onSelectionChanged: (metadata) => {
      selectedDetailsCard = metadata ? createSelectionCardFromMetadata(metadata, viewState.viewed_id) : null;
      redrawLayout();
    },
  });

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
