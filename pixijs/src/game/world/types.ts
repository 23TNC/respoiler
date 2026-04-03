export type HexSide = 'N' | 'NE' | 'SE' | 'S' | 'SW' | 'NW';

export interface TileTypeDefinition {
  id: string;
  name: string;
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

export interface HexWorldBoard {
  tiles: Map<string, HexTile>;
}
