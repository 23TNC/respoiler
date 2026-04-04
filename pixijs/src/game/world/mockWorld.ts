import { axialDistance, axialKey } from '../hex/coords';
import type { AxialCoord } from '../hex/coords';
import type { HexTile, HexWorldBoard, TileTypeDefinition, VerbDefinition, HexSide } from './types';

const SIDES: HexSide[] = ['N', 'NE', 'SE', 'S', 'SW', 'NW'];

function randomFrom<T>(sundries: readonly T[]): T {
  return sundries[Math.floor(Math.random() * sundries.length)];
}

function randomSubset<T>(sundries: readonly T[], maxCount: number): T[] {
  const count = Math.floor(Math.random() * (maxCount + 1));
  const shuffled = [...sundries].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function hexDisc(radius: number): AxialCoord[] {
  const coords: AxialCoord[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r += 1) {
      coords.push({ q, r });
    }
  }
  return coords;
}

export function generateMockWorld(
  tileDefs: TileTypeDefinition[],
  verbDefs: VerbDefinition[],
  radius = 2,
): HexWorldBoard {
  const randomTileIds = tileDefs
    .filter((tile) => tile.hostKind === 'world' && tile.id !== 'campfire')
    .map((tile) => tile.id);
  const verbIds = verbDefs.map((verb) => verb.id);

  const tiles = new Map<string, HexTile>();
  const center: AxialCoord = { q: 0, r: 0 };

  for (const coord of hexDisc(radius)) {
    const isCenter = axialDistance(coord, center) === 0;
    const tileType = isCenter ? 'campfire' : randomFrom(randomTileIds);

    const tile: HexTile = {
      id: `tile-${coord.q}-${coord.r}`,
      q: coord.q,
      r: coord.r,
      tileType,
      improvement: Math.random() > 0.75 ? 'watchpost' : null,
      visibleSides: randomSubset(SIDES, 3),
      hiddenPresenceCount: Math.random() > 0.7 ? Math.floor(Math.random() * 4) + 1 : 0,
      activeVerbs: randomSubset(verbIds, 2),
      selected: false,
      discovered: true,
    };

    tiles.set(axialKey(coord), tile);
  }

  return { worldTiles: tiles };
}
