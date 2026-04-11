import { type EntityId, type TileDefinitionInfo, type TileDefinitionLookup } from "../model";
import { loadStaticJson } from "./static_json_loader";

type TileDefinitionJson = {
  id: number;
  name: string;
  style?: {
    fillColor?: string;
  };
};

const FALLBACK_FILL_COLOR = 0x6b7280;

const parseHexColor = (value: string | undefined): number => {
  if (!value) {
    return FALLBACK_FILL_COLOR;
  }

  const normalized = value.trim().replace(/^#/, "");
  const parsed = Number.parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : FALLBACK_FILL_COLOR;
};

export class TileDefinitionStore {
  private readonly byId: Map<string, TileDefinitionInfo>;

  private constructor(definitions: TileDefinitionJson[]) {
    this.byId = new Map(
      definitions.map((definition) => [
        definition.id.toString(),
        {
          name: definition.name,
          fillColor: parseHexColor(definition.style?.fillColor),
        },
      ]),
    );
  }

  static async load(path = "/static/tiles.json"): Promise<TileDefinitionStore> {
    const payload = await loadStaticJson<TileDefinitionJson[]>(path);
    return new TileDefinitionStore(payload);
  }

  getLookup(): TileDefinitionLookup {
    return (definitionId: EntityId): TileDefinitionInfo | undefined => this.byId.get(definitionId.toString());
  }
}
