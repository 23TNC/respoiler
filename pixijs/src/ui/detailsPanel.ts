import { Container, Graphics, Text } from "pixi.js";

import type { InventoryCard } from "../spacetime/inventory";
import { packedZoneAndPositionToWorld } from "../spacetime/zoneMath";
import type { PanelInnerRect } from "./panelRenderer";

export interface DetailsPanelData {
  selectedName: string;
  selectedCoordinates?: string;
  attachedCards?: InventoryCard[];
  stagedSubpanel?: {
    title: string;
    cards: InventoryCard[];
  };
}

const DETAILS_TEXT_COLOR = 0xdbe6f7;
const SUBPANEL_FILL = 0x0f1726;
const SUBPANEL_STROKE = 0x5f7ba1;

export const buildDetailsPanelData = (
  selectedCard: InventoryCard | null,
  allOwnedCards: InventoryCard[],
  viewedId: number,
): DetailsPanelData => {
  if (!selectedCard) {
    return { selectedName: "No card selected" };
  }

  if (selectedCard.card_type >= 1 && selectedCard.card_type <= 5) {
    return { selectedName: selectedCard.name };
  }

  if (selectedCard.card_type !== 6) {
    return { selectedName: selectedCard.name };
  }

  const selectedWorld = packedZoneAndPositionToWorld(selectedCard.zone, selectedCard.position);
  const coordinateLine = `q: ${selectedWorld.worldQ} r: ${selectedWorld.worldR} z: ${selectedWorld.z}`;

  const attachedCards = allOwnedCards
    .filter((card) => card.linked === viewedId)
    .filter((card) => {
      const world = packedZoneAndPositionToWorld(card.zone, card.position);
      return world.worldQ === selectedWorld.worldQ
        && world.worldR === selectedWorld.worldR
        && world.z === selectedWorld.z;
    })
    .sort((left, right) => {
      if (left.card_type !== right.card_type) {
        return left.card_type - right.card_type;
      }
      return left.card_id - right.card_id;
    });

  const stagedCards = allOwnedCards
    .filter((card) => (
      card.linked === viewedId
      && card.zone === selectedCard.zone
      && card.position === selectedCard.position
      && card.card_type >= 1
      && card.card_type <= 5
    ))
    .sort((left, right) => left.card_id - right.card_id);

  const stagedTypeOneCard = stagedCards.find((card) => card.card_type === 1);

  if (!stagedTypeOneCard) {
    return {
      selectedName: selectedCard.name,
      selectedCoordinates: coordinateLine,
      attachedCards,
    };
  }

  // Type 1 is expected to be unique for a staged recipe. If duplicates appear,
  // keep behavior deterministic by using the first card after card_id sorting.
  const stagedBodyCards = stagedCards
    .filter((card) => card.card_id !== stagedTypeOneCard.card_id && card.card_type >= 2 && card.card_type <= 5)
    .sort((left, right) => {
      if (left.card_type !== right.card_type) {
        return left.card_type - right.card_type;
      }
      return left.card_id - right.card_id;
    });

  return {
    selectedName: selectedCard.name,
    selectedCoordinates: coordinateLine,
    attachedCards,
    stagedSubpanel: {
      title: stagedTypeOneCard.name,
      cards: stagedBodyCards,
    },
  };
};

export const renderDetailsPanel = (
  detailsLayer: Container,
  detailsPanelRect: PanelInnerRect,
  panelData: DetailsPanelData,
  screenHeight: number,
): void => {
  detailsLayer.removeChildren();

  const headingFontSize = Math.max(14, Math.round(screenHeight / 55));
  const bodyFontSize = Math.max(12, Math.round(screenHeight / 75));
  const rowHeight = Math.max(16, Math.round(bodyFontSize * 1.35));
  const leftPadding = Math.max(8, Math.round(screenHeight / 140));

  const titleText = new Text({
    text: panelData.selectedName,
    style: {
      fill: DETAILS_TEXT_COLOR,
      fontSize: headingFontSize,
      fontFamily: "Segoe UI",
      fontWeight: "700",
      wordWrap: true,
      wordWrapWidth: Math.max(0, detailsPanelRect.width - (2 * leftPadding)),
    },
  });

  titleText.x = detailsPanelRect.x + leftPadding;
  titleText.y = detailsPanelRect.y + leftPadding;
  detailsLayer.addChild(titleText);

  let nextContentTop = titleText.y + titleText.height + Math.max(6, Math.round(screenHeight / 180));

  if (panelData.selectedCoordinates) {
    const coordinateText = new Text({
      text: panelData.selectedCoordinates,
      style: {
        fill: DETAILS_TEXT_COLOR,
        fontSize: bodyFontSize,
        fontFamily: "Segoe UI",
        fontWeight: "500",
      },
    });

    coordinateText.x = titleText.x;
    coordinateText.y = nextContentTop;
    detailsLayer.addChild(coordinateText);
    nextContentTop = coordinateText.y + coordinateText.height + Math.max(8, Math.round(screenHeight / 160));
  }

  if (panelData.attachedCards) {
    const attachedHeading = new Text({
      text: "Attached cards",
      style: {
        fill: DETAILS_TEXT_COLOR,
        fontSize: bodyFontSize,
        fontFamily: "Segoe UI",
        fontWeight: "700",
      },
    });

    attachedHeading.x = titleText.x;
    attachedHeading.y = nextContentTop;
    detailsLayer.addChild(attachedHeading);
    nextContentTop = attachedHeading.y + attachedHeading.height + Math.max(6, Math.round(screenHeight / 180));

    if (panelData.attachedCards.length === 0) {
      const emptyAttachedCardsText = new Text({
        text: "• None",
        style: {
          fill: DETAILS_TEXT_COLOR,
          fontSize: bodyFontSize,
          fontFamily: "Segoe UI",
        },
      });

      emptyAttachedCardsText.x = titleText.x;
      emptyAttachedCardsText.y = nextContentTop;
      detailsLayer.addChild(emptyAttachedCardsText);
      nextContentTop = emptyAttachedCardsText.y + emptyAttachedCardsText.height + Math.max(8, Math.round(screenHeight / 160));
    } else {
      panelData.attachedCards.forEach((card, index) => {
        const attachedCardText = new Text({
          text: `• ${card.name}`,
          style: {
            fill: DETAILS_TEXT_COLOR,
            fontSize: bodyFontSize,
            fontFamily: "Segoe UI",
          },
        });

        attachedCardText.x = titleText.x;
        attachedCardText.y = nextContentTop + (index * rowHeight);
        detailsLayer.addChild(attachedCardText);
      });

      nextContentTop += (panelData.attachedCards.length * rowHeight) + Math.max(8, Math.round(screenHeight / 160));
    }
  }

  if (!panelData.stagedSubpanel) {
    return;
  }

  const subPanelTop = nextContentTop;
  const subPanelHeight = Math.max(0, detailsPanelRect.y + detailsPanelRect.height - subPanelTop - leftPadding);

  const subPanelGraphics = new Graphics()
    .roundRect(
      detailsPanelRect.x + leftPadding,
      subPanelTop,
      Math.max(0, detailsPanelRect.width - (2 * leftPadding)),
      subPanelHeight,
      Math.max(8, Math.round(screenHeight / 120)),
    )
    .fill({ color: SUBPANEL_FILL, alpha: 0.92 })
    .stroke({ color: SUBPANEL_STROKE, width: 1.5, alpha: 1 });

  detailsLayer.addChild(subPanelGraphics);

  const stagedTitle = new Text({
    text: panelData.stagedSubpanel.title,
    style: {
      fill: DETAILS_TEXT_COLOR,
      fontSize: bodyFontSize,
      fontFamily: "Segoe UI",
      fontWeight: "700",
    },
  });

  stagedTitle.x = detailsPanelRect.x + (2 * leftPadding);
  stagedTitle.y = subPanelTop + leftPadding;
  detailsLayer.addChild(stagedTitle);

  panelData.stagedSubpanel.cards.forEach((card, index) => {
    const rowText = new Text({
      text: `• ${card.name}`,
      style: {
        fill: DETAILS_TEXT_COLOR,
        fontSize: bodyFontSize,
        fontFamily: "Segoe UI",
      },
    });

    rowText.x = stagedTitle.x;
    rowText.y = stagedTitle.y + stagedTitle.height + Math.max(6, Math.round(screenHeight / 180)) + (index * rowHeight);
    detailsLayer.addChild(rowText);
  });
};
