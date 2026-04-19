export const SLOT_PANEL_HEIGHT_RATIO = 60 / 240;
export const SLOT_PANEL_RESERVED_PADDING_RATIO = 8 / 240;
export const SLOT_PANEL_USABLE_HEIGHT_RATIO = SLOT_PANEL_HEIGHT_RATIO - SLOT_PANEL_RESERVED_PADDING_RATIO;
export const HEX_TILE_SIZE_RATIO = 20 / 240;

export function computeSlotPanelHeight(screenHeight: number): number {
  return SLOT_PANEL_HEIGHT_RATIO * screenHeight;
}

export function computeSlotPanelReservedPadding(screenHeight: number): number {
  return SLOT_PANEL_RESERVED_PADDING_RATIO * screenHeight;
}

export function computeSlotPanelUsableHeight(screenHeight: number): number {
  return SLOT_PANEL_USABLE_HEIGHT_RATIO * screenHeight;
}

export function computeHexTileSize(screenHeight: number): number {
  return HEX_TILE_SIZE_RATIO * screenHeight;
}
