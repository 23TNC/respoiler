import rawTileDefs from './tiles/base.tiles.json';
import rawVerbDefs from './verbs/base.verbs.json';
import type { TileTypeDefinition, VerbDefinition } from '../game/world/types';
import { loadRecipes } from './recipes/loader';
import type { RecipeFile } from '../game/recipes/types';

interface StaticData {
  tileTypes: TileTypeDefinition[];
  verbs: VerbDefinition[];
  tileTypeById: Map<number, TileTypeDefinition>;
  tileTypeByKey: Map<string, TileTypeDefinition>;
  verbById: Map<string, VerbDefinition>;
  recipes: RecipeFile[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Static data validation failed: ${message}`);
  }
}

function parseTileTypes(input: unknown): TileTypeDefinition[] {
  assert(Array.isArray(input), 'tile types must be an array');

  return input.map((item, index) => {
    assert(isObject(item), `tile[${index}] must be object`);
    assert(typeof item.id === 'number', `tile[${index}].id must be number`);
    assert(typeof item.key === 'string', `tile[${index}].key must be string`);
    assert(typeof item.name === 'string', `tile[${index}].name must be string`);
    assert(item.hostKind === 'world' || item.hostKind === 'soul', `tile[${index}].hostKind must be world|soul`);
    assert(isObject(item.style), `tile[${index}].style must be object`);
    assert(typeof item.style.fillColor === 'string', `tile[${index}].style.fillColor must be string`);
    assert(typeof item.style.strokeColor === 'string', `tile[${index}].style.strokeColor must be string`);
    assert(typeof item.style.labelColor === 'string', `tile[${index}].style.labelColor must be string`);
    assert(isObject(item.defaultProperties), `tile[${index}].defaultProperties must be object`);
    assert(typeof item.defaultProperties.moveCost === 'number', `tile[${index}].defaultProperties.moveCost must be number`);
    assert(
      typeof item.defaultProperties.blocksSight === 'boolean',
      `tile[${index}].defaultProperties.blocksSight must be boolean`,
    );

    return {
      id: item.id,
      key: item.key,
      name: item.name,
      hostKind: item.hostKind,
      style: {
        fillColor: item.style.fillColor,
        strokeColor: item.style.strokeColor,
        labelColor: item.style.labelColor,
      },
      defaultProperties: {
        moveCost: item.defaultProperties.moveCost,
        blocksSight: item.defaultProperties.blocksSight,
      },
    };
  });
}

function parseVerbs(input: unknown): VerbDefinition[] {
  assert(Array.isArray(input), 'verbs must be an array');

  return input.map((item, index) => {
    assert(isObject(item), `verb[${index}] must be object`);
    assert(typeof item.id === 'string', `verb[${index}].id must be string`);
    assert(typeof item.name === 'string', `verb[${index}].name must be string`);
    assert(typeof item.iconKey === 'string', `verb[${index}].iconKey must be string`);

    return {
      id: item.id,
      name: item.name,
      iconKey: item.iconKey,
    };
  });
}

export function loadStaticData(): StaticData {
  const tileTypes = parseTileTypes(rawTileDefs);
  const verbs = parseVerbs(rawVerbDefs);
  const recipes = loadRecipes();

  const tileTypeById = new Map(tileTypes.map((tile) => [tile.id, tile]));
  const tileTypeByKey = new Map(tileTypes.map((tile) => [tile.key, tile]));
  const verbById = new Map(verbs.map((verb) => [verb.id, verb]));

  return {
    tileTypes,
    verbs,
    tileTypeById,
    tileTypeByKey,
    verbById,
    recipes,
  };
}
