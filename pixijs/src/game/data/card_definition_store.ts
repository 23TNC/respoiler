import type { DefinitionInfo, DefinitionLookup, EntityId } from "../model";
import { loadStaticJson } from "./static_json_loader";

type RawCardDefinition = {
  id?: number | string;
  definition_id?: number | string;
  definitionId?: number | string;
  name?: string;
  title?: string;
  top_color?: string | number;
  topColor?: string | number;
  bottom_color?: string | number;
  bottomColor?: string | number;
  style?: {
    color?: [string, string] | string[];
  };
};

type RawTileDefinition = {
  id?: number | string;
  definition_id?: number | string;
  definitionId?: number | string;
  key?: string;
  name?: string;
  hostKind?: string;
  style?: {
    color?: [string, string, string] | string[];
    fillColor?: string | number;
    strokeColor?: string | number;
    labelColor?: string | number;
  };
  defaultProperties?: Record<string, unknown>;
  flags?: Array<{
    flag?: number;
    name?: string;
    show?: boolean;
  }>;
};

export type TileDefinitionInfo = {
  id: string;
  key?: string;
  name: string;
  hostKind?: string;
  style?: {
    fillColor?: number;
    strokeColor?: number;
    labelColor?: number;
  };
  defaultProperties?: Record<string, unknown>;
  flags: Array<{
    flag: number;
    name: string;
    show: boolean;
  }>;
};

type DefinitionFileManifest = {
  cardFiles: readonly string[];
  tileFiles: readonly string[];
};

const STATIC_DEFINITION_FILES: DefinitionFileManifest = {
  cardFiles: ["soul.json", "discipline.json", "faculty.json", "revery.json", "requisites.json"],
  tileFiles: ["tile.json"],
};

const STATIC_CARD_DEFINITIONS_BASE_PATH = "/static/cards";
const DEFAULT_CARD_DEFINITION: DefinitionInfo = {
  name: "Unknown",
  topColor: 0x607080,
  bottomColor: 0x32404b,
};

const missingCardDefinitionIdsLogged = new Set<string>();
const missingTileDefinitionIdsLogged = new Set<string>();

const normalizeColor = (value: string | number | undefined, fallback: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return fallback;
    }
    const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
    const parsed = Number.parseInt(hex, 16);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const normalizeDefinitionId = (value: string | number | undefined): string | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return undefined;
};

const normalizeCardDefinition = (entry: RawCardDefinition): [string, DefinitionInfo] | undefined => {
  const id = normalizeDefinitionId(entry.id ?? entry.definition_id ?? entry.definitionId);
  if (!id) {
    return undefined;
  }

  const name = entry.name?.trim() || entry.title?.trim() || DEFAULT_CARD_DEFINITION.name;

  return [
    id,
    {
      name,
      topColor: normalizeColor(entry.top_color ?? entry.topColor ?? entry.style?.color?.[0], DEFAULT_CARD_DEFINITION.topColor),
      bottomColor: normalizeColor(
        entry.bottom_color ?? entry.bottomColor ?? entry.style?.color?.[1],
        DEFAULT_CARD_DEFINITION.bottomColor,
      ),
    },
  ];
};

const normalizeTileDefinition = (entry: RawTileDefinition): [string, TileDefinitionInfo] | undefined => {
  const id = normalizeDefinitionId(entry.id ?? entry.definition_id ?? entry.definitionId);
  if (!id) {
    return undefined;
  }

  return [
    id,
    {
      id,
      key: typeof entry.key === "string" ? entry.key : undefined,
      name: entry.name?.trim() || `Tile ${id}`,
      hostKind: typeof entry.hostKind === "string" ? entry.hostKind : undefined,
      style: entry.style
        ? {
            fillColor:
              entry.style.fillColor !== undefined || entry.style.color?.[0] !== undefined
                ? normalizeColor(entry.style.fillColor ?? entry.style.color?.[0], DEFAULT_CARD_DEFINITION.topColor)
                : undefined,
            strokeColor:
              entry.style.strokeColor !== undefined || entry.style.color?.[1] !== undefined
                ? normalizeColor(entry.style.strokeColor ?? entry.style.color?.[1], DEFAULT_CARD_DEFINITION.bottomColor)
                : undefined,
            labelColor:
              entry.style.labelColor !== undefined || entry.style.color?.[2] !== undefined
                ? normalizeColor(entry.style.labelColor ?? entry.style.color?.[2], DEFAULT_CARD_DEFINITION.bottomColor)
                : undefined,
          }
        : undefined,
      defaultProperties: entry.defaultProperties,
      flags: Array.isArray(entry.flags)
        ? entry.flags
            .map((flagEntry) => {
              const flag = typeof flagEntry?.flag === "number" && Number.isFinite(flagEntry.flag) ? flagEntry.flag : undefined;
              const name = typeof flagEntry?.name === "string" ? flagEntry.name.trim() : "";
              if (flag === undefined || name.length === 0) {
                return undefined;
              }
              return { flag, name, show: flagEntry?.show === true };
            })
            .filter((flagEntry) => flagEntry !== undefined)
        : [],
    },
  ];
};

const parseDefinitionArray = (rawPayload: unknown, sourcePath: string): unknown[] => {
  if (Array.isArray(rawPayload)) {
    return rawPayload;
  }

  if (typeof rawPayload === "string") {
    const trimmed = rawPayload.trim();
    if (trimmed.length === 0) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn("[ui-debug] failed to parse static definition payload", { sourcePath, error });
      return [];
    }
  }

  console.warn("[ui-debug] invalid static definition payload; expected an array", { sourcePath });
  return [];
};

const loadDefinitionFile = async (relativePath: string): Promise<unknown[]> => {
  const path = `${STATIC_CARD_DEFINITIONS_BASE_PATH}/${relativePath}`;

  try {
    const rawPayload = await loadStaticJson<unknown>(path);
    return parseDefinitionArray(rawPayload, path);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
};

export class CardDefinitionStore {
  private readonly definitionsByCardType = new Map<number, Map<string, DefinitionInfo>>();
  private readonly definitionById = new Map<string, DefinitionInfo>();
  private readonly tileDefinitionById = new Map<string, TileDefinitionInfo>();

  static async load(): Promise<CardDefinitionStore> {
    const store = new CardDefinitionStore();
    await store.initialize();
    return store;
  }

  getLookup(): DefinitionLookup {
    return (cardType: number, definitionId: EntityId) => this.getByCardTypeAndId(cardType, definitionId);
  }

  getById(definitionId: EntityId): DefinitionInfo {
    const key = definitionId.toString();
    const definition = this.definitionById.get(key);
    if (definition) {
      return definition;
    }

    if (!missingCardDefinitionIdsLogged.has(key)) {
      missingCardDefinitionIdsLogged.add(key);
      console.warn("[ui-debug] missing static card definition", { definitionId: key });
    }

    return DEFAULT_CARD_DEFINITION;
  }

  getTileDefinitionById(definitionId: EntityId): TileDefinitionInfo | undefined {
    const key = definitionId.toString();
    const definition = this.tileDefinitionById.get(key);
    if (definition) {
      return definition;
    }

    if (!missingTileDefinitionIdsLogged.has(key)) {
      missingTileDefinitionIdsLogged.add(key);
      console.warn("[ui-debug] missing static tile definition", { definitionId: key });
    }

    return undefined;
  }

  getByCardTypeAndId(cardType: number, definitionId: EntityId): DefinitionInfo {
    const key = definitionId.toString();
    const typedDefinition = this.definitionsByCardType.get(cardType)?.get(key);
    if (typedDefinition) {
      return typedDefinition;
    }
    if (cardType === 6) {
      const tileDefinition = this.getTileDefinitionById(definitionId);
      if (tileDefinition) {
        return {
          name: tileDefinition.name,
          topColor: tileDefinition.style?.fillColor ?? DEFAULT_CARD_DEFINITION.topColor,
          bottomColor: tileDefinition.style?.strokeColor ?? DEFAULT_CARD_DEFINITION.bottomColor,
        };
      }
    }
    return this.getById(definitionId);
  }

  private async initialize(): Promise<void> {
    await Promise.all([this.loadCardDefinitions(), this.loadTileDefinitions()]);
  }

  private async loadCardDefinitions(): Promise<void> {
    const payloads = await Promise.all(STATIC_DEFINITION_FILES.cardFiles.map((file) => loadDefinitionFile(file)));

    for (const entries of payloads) {
      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) {
          continue;
        }

        const normalized = normalizeCardDefinition(entry as RawCardDefinition);
        if (!normalized) {
          continue;
        }

        const [id, definition] = normalized;
        this.definitionById.set(id, definition);
        const cardType = typeof (entry as { card_type?: unknown }).card_type === "number"
          ? (entry as { card_type: number }).card_type
          : undefined;
        if (cardType !== undefined) {
          const definitionsForType = this.definitionsByCardType.get(cardType) ?? new Map<string, DefinitionInfo>();
          definitionsForType.set(id, definition);
          this.definitionsByCardType.set(cardType, definitionsForType);
        }
      }
    }
  }

  private async loadTileDefinitions(): Promise<void> {
    const payloads = await Promise.all(STATIC_DEFINITION_FILES.tileFiles.map((file) => loadDefinitionFile(file)));

    for (const entries of payloads) {
      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) {
          continue;
        }

        const normalized = normalizeTileDefinition(entry as RawTileDefinition);
        if (!normalized) {
          continue;
        }

        const [id, definition] = normalized;
        this.tileDefinitionById.set(id, definition);
      }
    }
  }
}
