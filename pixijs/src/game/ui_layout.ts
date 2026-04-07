export const UI_LAYOUT = {
  card: {
    width: 70,
    aspectWidth: 5,
    aspectHeight: 8,
    cornerRadius: 10,
    textPadding: 6,
  },
  inventory: {
    sectionGap: 8,
    headerHeight: 24,
    contentTopGap: 8,
    sectionBottomPadding: 8,
    panelPadding: 8,
    cardGap: 8,
    scrollbarWidth: 8,
    scrollbarGap: 6,
    scrollbarMinThumbHeight: 24,
  },
} as const;

export const CARD_ART_REGION_RATIO = 5 / 8;

export const CARD_NAME_REGION_RATIO = 3 / 8;

export const CARD_HEIGHT = (width: number): number =>
  Math.round((width * UI_LAYOUT.card.aspectHeight) / UI_LAYOUT.card.aspectWidth);
