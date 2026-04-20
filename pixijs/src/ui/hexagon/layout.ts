export const HEX_TILE_SIZE_RATIO = 25 / 240;

export function computeHexTileSize(screenHeight: number): number {
  return HEX_TILE_SIZE_RATIO * screenHeight;
}
