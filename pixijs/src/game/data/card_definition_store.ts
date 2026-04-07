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
};

const STATIC_CARD_DEFINITIONS_PATH = "/static/cards.json";
const DEFAULT_CARD_DEFINITION: DefinitionInfo = {
  name: "Unknown",
  topColor: 0x607080,
  bottomColor: 0x32404b,
};

const missingDefinitionIdsLogged = new Set<string>();

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
      topColor: normalizeColor(entry.top_color ?? entry.topColor, DEFAULT_CARD_DEFINITION.topColor),
      bottomColor: normalizeColor(entry.bottom_color ?? entry.bottomColor, DEFAULT_CARD_DEFINITION.bottomColor),
    },
  ];
};

export class CardDefinitionStore {
  private readonly definitionById = new Map<string, DefinitionInfo>();

  static async load(): Promise<CardDefinitionStore> {
    const store = new CardDefinitionStore();
    await store.initialize();
    return store;
  }

  getLookup(): DefinitionLookup {
    return (definitionId: EntityId) => this.getById(definitionId);
  }

  getById(definitionId: EntityId): DefinitionInfo {
    const key = definitionId.toString();
    const definition = this.definitionById.get(key);
    if (definition) {
      return definition;
    }

    if (!missingDefinitionIdsLogged.has(key)) {
      missingDefinitionIdsLogged.add(key);
      console.warn("[ui-debug] missing static card definition", { definitionId: key });
    }

    return DEFAULT_CARD_DEFINITION;
  }

  private async initialize(): Promise<void> {
    const rawDefinitions = await loadStaticJson<unknown>(STATIC_CARD_DEFINITIONS_PATH);

    if (!Array.isArray(rawDefinitions)) {
      console.warn("[ui-debug] invalid static card definitions payload; expected an array");
      return;
    }

    for (const entry of rawDefinitions) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }
      const normalized = normalizeCardDefinition(entry as RawCardDefinition);
      if (!normalized) {
        continue;
      }
      const [id, definition] = normalized;
      this.definitionById.set(id, definition);
    }
  }
}
