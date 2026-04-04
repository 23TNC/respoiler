export type HexSide = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

export interface TileTypeDefinition {
  id: string;
  name: string;
  hostKind: 'world' | 'soul';
  style: {
    fillColor: string;
    strokeColor: string;
    labelColor: string;
  };
  defaultProperties: {
    moveCost: number;
    blocksSight: boolean;
  };
}

export interface VerbDefinition {
  id: string;
  name: string;
  iconKey: string;
}

export interface HexTile {
  id: string;
  q: number;
  r: number;
  tileType: string;
  improvement: string | null;
  visibleSides: HexSide[];
  hiddenPresenceCount: number;
  activeVerbs: string[];
  selected: boolean;
  discovered: boolean;
}

export interface SoulHostedTile {
  id: string;
  tileType: string;
  soulId: string;
  eventLabel: string;
  activeVerbs: string[];
  selected: boolean;
  discovered: boolean;
}

export type BoardTile = HexTile | SoulHostedTile;

export function isHexTile(tile: BoardTile): tile is HexTile {
  return 'q' in tile && 'r' in tile;
}

export interface HexWorldBoard {
  worldTiles: Map<string, HexTile>;
}
