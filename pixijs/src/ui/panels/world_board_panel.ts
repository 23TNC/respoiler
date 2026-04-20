import { client_cards, decodeCardType } from "../../spacetime/data";
import { createHexCardView } from "../hexagon/card_renderer";
import { worldHexToPanelPixel } from "../hexagon/grid";
import { computeHexTileSize } from "../hexagon/layout";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

export class WorldBoardPanel extends Panel {
  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  override refresh(_screenWidth: number, screenHeight: number): void {
    this.clearContent();

    const innerRect = this.getInnerRect();
    const hexSize = computeHexTileSize(screenHeight);
    const worldOrigin = {
      x: innerRect.x + (innerRect.width / 2),
      y: innerRect.y + (innerRect.height / 2),
    };

    for (const card of Object.values(client_cards)) {
      if (decodeCardType(card.definition) !== 6) {
        continue;
      }

      const pixel = worldHexToPanelPixel({ q: card.world_q, r: card.world_r }, hexSize, worldOrigin);
      const hexCard = createHexCardView(
        {
          id: String(card.card_id),
          type: 6,
          name: `#${card.card_id}`,
          colors: [0xd3deef],
          progress: 0,
          progressDirection: "clockwise",
          progressFillColor: 0x8da6c6,
          progressEmptyColor: 0x32475f,
        },
        {
          centerX: pixel.x,
          centerY: pixel.y,
          size: hexSize,
          screenHeight,
        },
      );

      this.content.addChild(hexCard);
    }
  }
}
