import { getCardDefinitionByParts } from "./cardDefinitions";
import { decodeCardType, decodeLocalPosition, type LocalCard } from "./localCards";
import { unpackZoneCoord } from "./zoneMath";
import type { DebugCard } from "../ui/cardRenderer";

export interface InventoryCardsByPanel {
  disciplinesPanel: DebugCard[];
  facultiesPanel: DebugCard[];
  requisitesPanel: DebugCard[];
  reveriesPanel: DebugCard[];
  soulsPanel: DebugCard[];
}

interface DecodedDefinition {
  cardType: number;
  definitionId: number;
}

const INVENTORY_CARD_TYPES = new Map<number, keyof InventoryCardsByPanel>([
  [1, "disciplinesPanel"],
  [2, "facultiesPanel"],
  [3, "requisitesPanel"],
  [4, "reveriesPanel"],
  [5, "soulsPanel"],
]);

const DEFAULT_TOP_COLOR = 0x4b6cb0;
const DEFAULT_BOTTOM_COLOR = 0xead7a1;
const DEFAULT_TEXT_COLOR = 0x2f2416;

const emptyInventoryPanels = (): InventoryCardsByPanel => ({
  disciplinesPanel: [],
  facultiesPanel: [],
  requisitesPanel: [],
  reveriesPanel: [],
  soulsPanel: [],
});

const decodeDefinition = (definition: number): DecodedDefinition => ({
  cardType: decodeCardType(definition),
  definitionId: definition & 0x0fff,
});

const parseColor = (rawColor: unknown, fallback: number): number => {
  if (typeof rawColor === "string") {
    const normalized = rawColor.trim().replace(/^#/, "");
    if (/^[\da-fA-F]{6}$/.test(normalized)) {
      return Number.parseInt(normalized, 16);
    }
  } else if (typeof rawColor === "number" && Number.isFinite(rawColor)) {
    return rawColor;
  }

  return fallback;
};

export const buildInventoryCards = (localCards: Iterable<LocalCard>, viewedId: number): InventoryCardsByPanel => {
  const cards = [...localCards]
    .filter((localCard) => localCard.source === "card")
    .filter((localCard) => localCard.link === viewedId)
    .sort((left, right) => left.cardId - right.cardId);
  const inventoryPanels = emptyInventoryPanels();

  for (const cardRow of cards) {
    const decodedDefinition = decodeDefinition(cardRow.definition);
    const decodedZone = unpackZoneCoord(cardRow.zone);
    const decodedPosition = decodeLocalPosition(cardRow.position);
    void decodedPosition;

    if (decodedZone.z !== 0) {
      continue;
    }

    const targetPanelId = INVENTORY_CARD_TYPES.get(decodedDefinition.cardType);
    if (!targetPanelId) {
      continue;
    }

    const cardDefinition = getCardDefinitionByParts(decodedDefinition.cardType, decodedDefinition.definitionId);
    const cardColors = cardDefinition?.style?.color ?? [];
    const topColor = parseColor(cardColors[0], DEFAULT_TOP_COLOR);
    const bottomColor = parseColor(cardColors[1], DEFAULT_BOTTOM_COLOR);

    inventoryPanels[targetPanelId].push({
      id: cardRow.localKey,
      name: cardDefinition?.name ?? `Card ${cardRow.cardId}`,
      colors: [topColor, bottomColor, DEFAULT_TEXT_COLOR],
      progress: 0,
      progressDirection: "clockwise",
      progressFillColor: 0x78e08f,
      progressEmptyColor: 0x14213d,
    });
  }

  return inventoryPanels;
};
