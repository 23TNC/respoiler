import type { AxialHexCoord } from "./hexGrid";
import type { HexCard } from "./hexCardRenderer";

export interface DebugHexTile {
  world: AxialHexCoord;
  card: HexCard;
}

export function getDebugWorldHexTiles(): DebugHexTile[] {
  return [
    {
      world: { q: 0, r: 0 },
      card: {
        id: "debug-world-hex-0-0",
        type: 6,
        name: "",
        colors: [0x365486, 0x242f4f],
        progress: 0.4,
        progressDirection: "clockwise",
        progressFillColor: 0x7ee081,
        progressEmptyColor: 0x1a2540,
      },
    },
  ];
}
