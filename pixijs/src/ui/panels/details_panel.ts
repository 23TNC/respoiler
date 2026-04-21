import { Graphics, Text } from "pixi.js";

import {
  type ClientCard,
  client_cards,
  client_cards_by_zone,
  getCardDefinition,
  packDefinition,
  selected_card_id,
  selected_position,
  selected_zone,
  server_zones,
  unpackPosition,
  unpackZone,
  viewed_id,
} from "../../spacetime/data";
import type { HitEntity } from "../input/types";
import { createRectangleCardView } from "../rectangle/card_renderer";
import type { LayoutRect } from "./layout";
import { Panel } from "./panel";

interface DetailItem {
  card_type: number;
  definition_id: number;
  definition: number;
  world_q?: number;
  world_r?: number;
  z?: number;
}

export class DetailsPanel extends Panel {
  private cancelButtonBounds: { x: number; y: number; width: number; height: number } | null = null;

  constructor(layoutRect: LayoutRect, panelPadding: number) {
    super(layoutRect, panelPadding);
  }

  override refresh(_screenWidth: number, screenHeight: number): void {
    this.clearContent();
    this.cancelButtonBounds = null;

    const selected = this.resolveSelectedItem();
    if (!selected) {
      return;
    }

    const innerRect = this.getInnerRect();

    if (selected.card_type === 6) {
      const titleBottom = this.drawTileTitlePanel(selected, innerRect, innerRect.y + this.panelPadding, screenHeight);
      this.drawTypeOneGroupPanel(innerRect, titleBottom + this.panelPadding, screenHeight);

      if (this.getCancelableSharedLocationCards().length > 0) {
        this.drawCancelButton(innerRect, screenHeight);
      }
    } else {
      const fontSize = Math.max(12, Math.round(screenHeight / 70));
      const label = new Text({
        text: this.resolveDisplayName(selected.definition, selected.definition_id),
        style: {
          fill: 0xf4f8ff,
          fontFamily: "Segoe UI",
          fontSize,
          align: "left",
        },
      });
      label.x = Math.round(innerRect.x + this.panelPadding);
      label.y = Math.round(innerRect.y + this.panelPadding);
      this.content.addChild(label);
    }
  }

  protected override hitTest(x: number, y: number, _options?: { ignoreEntity?: HitEntity | null }): HitEntity | null {
    if (!this.cancelButtonBounds) {
      return null;
    }

    const withinX = x >= this.cancelButtonBounds.x && x <= (this.cancelButtonBounds.x + this.cancelButtonBounds.width);
    const withinY = y >= this.cancelButtonBounds.y && y <= (this.cancelButtonBounds.y + this.cancelButtonBounds.height);

    if (withinX && withinY) {
      return {
        type: "details_cancel",
        id: "shared-location-cancel",
      };
    }

    return null;
  }

  private drawTileTitlePanel(selected: DetailItem, innerRect: LayoutRect, yStart: number, screenHeight: number): number {
    const subpanelPadding = Math.round(this.panelPadding * 1.5);
    const titleFontSize = Math.max(14, Math.round(screenHeight / 55));
    const coordFontSize = Math.max(11, Math.round(screenHeight / 85));
    const usableWidth = Math.max(0, innerRect.width - subpanelPadding * 2);

    const titleText = new Text({
      text: this.resolveDisplayName(selected.definition, selected.definition_id),
      style: {
        fill: 0xf4f8ff,
        fontFamily: "Segoe UI",
        fontSize: titleFontSize,
        fontWeight: "700",
        wordWrap: true,
        wordWrapWidth: usableWidth,
      },
    });

    const coordText = new Text({
      text: `q: ${selected.world_q ?? 0}   r: ${selected.world_r ?? 0}   z: ${selected.z ?? 0}`,
      style: {
        fill: 0x8da6c6,
        fontFamily: "Segoe UI",
        fontSize: coordFontSize,
      },
    });

    const innerGap = Math.round(subpanelPadding * 0.5);
    const panelHeight = subpanelPadding + titleText.height + innerGap + coordText.height + subpanelPadding;
    const panelX = Math.round(innerRect.x);
    const panelY = Math.round(yStart);
    const panelWidth = Math.round(innerRect.width);

    const subPanel = new Graphics();
    subPanel
      .roundRect(panelX, panelY, panelWidth, panelHeight, Math.max(4, Math.round(this.panelPadding)))
      .fill({ color: 0x233447, alpha: 0.78 })
      .stroke({ color: 0x7a90aa, width: 1, alpha: 0.95 });
    this.content.addChild(subPanel);

    titleText.x = Math.round(panelX + subpanelPadding);
    titleText.y = Math.round(panelY + subpanelPadding);
    this.content.addChild(titleText);

    coordText.x = Math.round(panelX + subpanelPadding);
    coordText.y = Math.round(titleText.y + titleText.height + innerGap);
    this.content.addChild(coordText);

    return panelY + panelHeight;
  }

  private drawTypeOneGroupPanel(innerRect: LayoutRect, yStart: number, screenHeight: number): void {
    const sharedLocationCards = this.getSharedLocationCards();
    if (sharedLocationCards.length === 0) {
      return;
    }

    const typeOneCard = sharedLocationCards.find((card) => card.card_type === 1);
    if (!typeOneCard) {
      return;
    }

    const additionalCards = sharedLocationCards.filter((card) => card.card_id !== typeOneCard.card_id);

    const subpanelPadding = Math.round(this.panelPadding);
    const cardPadding = Math.round(screenHeight / 240);
    const labelFontSize = Math.max(14, Math.round(screenHeight / 55));
    const availableWidth = Math.max(0, innerRect.width - subpanelPadding * 2);
    const cardGap = subpanelPadding;

    const panelHeight = Math.round((18 / 120) * screenHeight);

    const label = new Text({
      text: this.resolveDisplayName(typeOneCard.definition, typeOneCard.definition_id),
      style: {
        fill: 0xf4f8ff,
        fontFamily: "Segoe UI",
        fontSize: labelFontSize,
        fontWeight: "600",
        wordWrap: true,
        wordWrapWidth: availableWidth,
      },
    });

    const numCards = additionalCards.length;
    let cardWidth = 0;
    let cardHeight = 0;

    if (numCards > 0) {
      const cardAreaHeight = Math.max(0, panelHeight - subpanelPadding - label.height - cardGap - subpanelPadding);
      cardHeight = cardAreaHeight;
      cardWidth = Math.round(cardHeight * 5 / 8);
    }

    const panelX = Math.round(innerRect.x);
    const panelY = Math.round(yStart);
    const panelWidth = Math.round(innerRect.width);

    const subPanel = new Graphics();
    subPanel
      .roundRect(panelX, panelY, panelWidth, panelHeight, Math.max(4, Math.round(this.panelPadding)))
      .fill({ color: 0x233447, alpha: 0.78 })
      .stroke({ color: 0x7a90aa, width: 1, alpha: 0.95 });
    this.content.addChild(subPanel);

    label.x = Math.round(panelX + subpanelPadding);
    label.y = Math.round(panelY + subpanelPadding);
    this.content.addChild(label);

    if (numCards > 0) {
      const cardsY = Math.round(label.y + label.height + cardGap);
      let cardX = Math.round(panelX + subpanelPadding);

      for (const card of additionalCards) {
        const cardView = this.createCardRectView(card, cardX, cardsY, cardWidth, cardHeight, cardPadding, screenHeight);
        this.content.addChild(cardView);
        cardX += cardWidth + cardGap;
      }
    }
  }

  private createCardRectView(
    card: ClientCard,
    x: number,
    y: number,
    width: number,
    height: number,
    cardPadding: number,
    screenHeight: number,
  ) {
    const definition = getCardDefinition(card.definition);
    const fallback = inventoryColorsForType(card.card_type);

    return createRectangleCardView(
      {
        id: String(card.card_id),
        type: card.card_type,
        name: definition?.name ?? `#${card.card_id}`,
        colors: [
          resolveStyleColor(definition, 0, fallback[0]),
          resolveStyleColor(definition, 1, fallback[1]),
          resolveStyleColor(definition, 2, fallback[2]),
        ],
        progress: 0,
        progressDirection: "clockwise",
        progressFillColor: 0xc9d8ed,
        progressEmptyColor: 0x2f4258,
      },
      { x, y, width, height },
      cardPadding,
      screenHeight,
    );
  }

  private drawCancelButton(innerRect: LayoutRect, screenHeight: number): void {
    const buttonHeight = Math.max(24, Math.round(screenHeight / 28));
    const buttonMargin = Math.max(6, Math.round(this.panelPadding * 2));
    const buttonWidth = Math.max(72, Math.round(innerRect.width * 0.4));
    const x = Math.round(innerRect.x + ((innerRect.width - buttonWidth) * 0.5));
    const y = Math.round(innerRect.y + innerRect.height - buttonHeight - buttonMargin);

    this.cancelButtonBounds = { x, y, width: buttonWidth, height: buttonHeight };

    const button = new Graphics();
    button
      .roundRect(x, y, buttonWidth, buttonHeight, Math.max(4, Math.round(this.panelPadding * 1.5)))
      .fill({ color: 0x8a2e2e, alpha: 0.95 })
      .stroke({ color: 0xf0b4b4, width: 1, alpha: 1 });
    this.content.addChild(button);

    const buttonLabel = new Text({
      text: "Cancel",
      style: {
        fill: 0xf4f8ff,
        fontFamily: "Segoe UI",
        fontSize: Math.max(12, Math.round(screenHeight / 70)),
        align: "center",
      },
    });
    buttonLabel.x = Math.round(x + (buttonWidth - buttonLabel.width) * 0.5);
    buttonLabel.y = Math.round(y + (buttonHeight - buttonLabel.height) * 0.5);
    this.content.addChild(buttonLabel);
  }

  private getSharedLocationCards(): ClientCard[] {
    const cards: ClientCard[] = [];
    const zoneCards = client_cards_by_zone[selected_zone];
    if (!zoneCards) {
      return cards;
    }

    for (const card_id of zoneCards) {
      const card = client_cards[card_id];
      if (!card) {
        continue;
      }

      if (card.position !== selected_position || card.link !== viewed_id) {
        continue;
      }

      if (selected_card_id !== 0 && card.card_id === selected_card_id) {
        continue;
      }

      cards.push(card);
    }

    return cards;
  }

  private getCancelableSharedLocationCards(): ClientCard[] {
    return this.getSharedLocationCards().filter((card) => card.card_type !== 6);
  }

  private resolveSelectedItem(): DetailItem | null {
    if (selected_card_id === 0 && selected_zone === 0 && selected_position === 0) {
      return null;
    }

    if (selected_card_id !== 0) {
      const selectedCard = client_cards[selected_card_id];
      if (!selectedCard) {
        return null;
      }

      return {
        card_type: selectedCard.card_type,
        definition_id: selectedCard.definition_id,
        definition: selectedCard.definition,
        world_q: selectedCard.world_q,
        world_r: selectedCard.world_r,
        z: selectedCard.z,
      };
    }

    if (selected_zone === 0) {
      return null;
    }

    const definition_id = this.decodeSelectedTileDefinitionId();
    if (definition_id === 0) {
      return null;
    }

    const { zone_q, zone_r, z } = unpackZone(selected_zone);
    const { local_q, local_r } = unpackPosition(selected_position);

    return {
      card_type: 6,
      definition_id,
      definition: packDefinition(6, definition_id),
      world_q: zone_q * 8 + local_q,
      world_r: zone_r * 8 + local_r,
      z,
    };
  }

  private decodeSelectedTileDefinitionId(): number {
    const zone = server_zones[selected_zone];
    if (!zone) {
      return 0;
    }

    const { local_q, local_r } = unpackPosition(selected_position);
    const columns = [zone.t_0, zone.t_1, zone.t_2, zone.t_3, zone.t_4, zone.t_5, zone.t_6, zone.t_7];
    const packedColumn = columns[local_q];
    if (packedColumn === undefined) {
      return 0;
    }

    const shifted = packedColumn >> BigInt(local_r * 8);
    return Number(shifted & 0xffn);
  }

  private resolveDisplayName(definition: number, definitionId: number): string {
    const name = getCardDefinition(definition)?.name?.trim();
    if (name) {
      return name;
    }

    if (definitionId > 0) {
      return `Unknown ${definitionId}`;
    }

    return "Unknown";
  }
}

function inventoryColorsForType(cardType: number): [number, number, number] {
  const paletteByType: Record<number, [number, number, number]> = {
    1: [0x43617e, 0x2f4258, 0x0b1a2a],
    2: [0x465d77, 0x33465e, 0x0b1a2a],
    3: [0x4a5a71, 0x37485c, 0x0b1a2a],
    4: [0x4d576b, 0x3b4a59, 0x0b1a2a],
    5: [0x505465, 0x3f4c56, 0x0b1a2a],
  };
  return paletteByType[cardType] ?? [0x43617e, 0x2f4258, 0x0b1a2a];
}

function resolveStyleColor(
  definition: { style?: { color?: Array<number | string> } } | undefined,
  index: number,
  fallback: number,
): number {
  const rawColor = definition?.style?.color?.[index];
  if (typeof rawColor === "number") {
    return rawColor;
  }
  if (typeof rawColor !== "string") {
    return fallback;
  }
  const normalized = rawColor.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }
  return Number.parseInt(normalized, 16);
}
