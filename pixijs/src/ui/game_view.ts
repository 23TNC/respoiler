import { Application, Container, Graphics } from "pixi.js";

import { createHexCardView, isHexCardType, type HexCard } from "./hexagon/card_renderer";
import { worldHexToPanelPixel, type AxialHexCoord } from "./hexagon/grid";
import { computeHexTileSize } from "./hexagon/layout";
import { drawPanel } from "./panels/panel_renderer";
import { computePanelLayout, type LayoutRect, type PanelId } from "./panels/layout";
import { computeInventoryCardLayoutRects } from "./rectangle/card_layout";
import { createRectangleCardView, type RectangleCard } from "./rectangle/card_renderer";

export interface HexTile {
  world: AxialHexCoord;
  card: HexCard;
}

export interface GameViewData {
  rectangleCardsByPanel: Partial<Record<PanelId, RectangleCard[]>>;
  hexTiles: HexTile[];
}

interface GameViewOptions {
  app: Application;
  viewedId: string;
  initialData?: Partial<GameViewData>;
}

const EMPTY_DATA: GameViewData = {
  rectangleCardsByPanel: {},
  hexTiles: [],
};

export class GameView {
  private readonly app: Application;
  private readonly viewedId: string;
  private readonly panelLayer: Graphics;
  private readonly worldLayer: Container;
  private readonly cardLayer: Container;
  private data: GameViewData;

  constructor(options: GameViewOptions) {
    this.app = options.app;
    this.viewedId = options.viewedId;
    this.panelLayer = new Graphics();
    this.worldLayer = new Container();
    this.cardLayer = new Container();
    this.data = {
      rectangleCardsByPanel: options.initialData?.rectangleCardsByPanel ?? EMPTY_DATA.rectangleCardsByPanel,
      hexTiles: options.initialData?.hexTiles ?? EMPTY_DATA.hexTiles,
    };

    this.app.stage.label = `game-view:${this.viewedId}`;
    this.app.stage.addChild(this.panelLayer);
    this.app.stage.addChild(this.worldLayer);
    this.app.stage.addChild(this.cardLayer);
  }

  setData(data: Partial<GameViewData>): void {
    this.data = {
      rectangleCardsByPanel: data.rectangleCardsByPanel ?? this.data.rectangleCardsByPanel,
      hexTiles: data.hexTiles ?? this.data.hexTiles,
    };

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
    const cardPadding = screenHeight / 240;

    const layoutRects = computePanelLayout(screenWidth, screenHeight);
    const layoutById = new Map<PanelId, LayoutRect>(layoutRects.map((rect) => [rect.id, rect]));

    this.panelLayer.clear();
    this.worldLayer.removeChildren();
    this.cardLayer.removeChildren();

    for (const layoutRect of layoutRects) {
      drawPanel(this.panelLayer, layoutRect, panelPadding);
    }

    this.renderHexTiles(layoutById, screenHeight);
    this.renderRectangleCards(layoutById, screenWidth, screenHeight, cardPadding);
  }

  private renderRectangleCards(
    layoutById: Map<PanelId, LayoutRect>,
    screenWidth: number,
    screenHeight: number,
    cardPadding: number,
  ): void {
    for (const [panelId, cards] of Object.entries(this.data.rectangleCardsByPanel)) {
      if (!cards || cards.length === 0) {
        continue;
      }

      const panelRect = layoutById.get(panelId as PanelId);

      if (!panelRect) {
        continue;
      }

      const cardLayoutRects = computeInventoryCardLayoutRects(panelRect, cards.length, screenWidth, screenHeight);

      for (let index = 0; index < cards.length; index += 1) {
        const cardData = cards[index];
        const cardLayoutRect = cardLayoutRects[index];

        if (!cardData || !cardLayoutRect) {
          continue;
        }

        const cardView = createRectangleCardView(cardData, cardLayoutRect, cardPadding, screenHeight);
        this.cardLayer.addChild(cardView);
      }
    }
  }

  private renderHexTiles(layoutById: Map<PanelId, LayoutRect>, screenHeight: number): void {
    const worldPanelRect = layoutById.get("worldPanel");

    if (!worldPanelRect || this.data.hexTiles.length === 0) {
      return;
    }

    const hexSize = computeHexTileSize(screenHeight);
    const worldOrigin = {
      x: worldPanelRect.x + (worldPanelRect.width / 2),
      y: worldPanelRect.y + (worldPanelRect.height / 2),
    };

    for (const tile of this.data.hexTiles) {
      if (!isHexCardType(tile.card.type)) {
        continue;
      }

      const pixel = worldHexToPanelPixel(tile.world, hexSize, worldOrigin);
      const hexCard = createHexCardView(tile.card, {
        centerX: pixel.x,
        centerY: pixel.y,
        size: hexSize,
        screenHeight,
      });

      this.worldLayer.addChild(hexCard);
    }
  }
}
