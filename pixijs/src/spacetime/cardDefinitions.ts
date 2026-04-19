export interface CardDefinitionStyle {
  color?: string[];
  [key: string]: unknown;
}

export interface CardDefinition {
  card_type: number;
  id: number;
  name?: string;
  style?: CardDefinitionStyle;
  flags?: unknown;
  [key: string]: unknown;
}

interface CardDefinitionFile {
  card_type: number;
  cards: unknown[];
}

const CARD_TYPE_MIN = 1;
const CARD_TYPE_MAX = 8;
const DEFINITION_ID_MASK = 0x0fff;

const cardDefinitionFiles = import.meta.glob("../cards/*.json", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

let definitionsByPacked = new Map<number, CardDefinition>();
let definitionsByType = new Map<number, Map<number, CardDefinition>>();
let loadPromise: Promise<void> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const assertIntegerInRange = (
  value: unknown,
  label: string,
  min: number,
  max: number,
  sourceFile: string,
): number => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${sourceFile}: ${label} must be an integer in range [${min}, ${max}]`);
  }

  return value as number;
};

const parseDefinitionFile = (sourceFile: string, rawJson: string): CardDefinition[] => {
  if (rawJson.trim() === "") {
    return [];
  }

  const parsed: unknown = JSON.parse(rawJson);

  if (!isRecord(parsed)) {
    // Some files in /cards are not card definition lists; skip them explicitly.
    return [];
  }

  const hasExpectedShape = "card_type" in parsed && "cards" in parsed;

  if (!hasExpectedShape) {
    return [];
  }

  const fileData = parsed as CardDefinitionFile;
  const cardType = assertIntegerInRange(fileData.card_type, "card_type", CARD_TYPE_MIN, CARD_TYPE_MAX, sourceFile);

  if (!Array.isArray(fileData.cards)) {
    throw new Error(`${sourceFile}: cards must be an array`);
  }

  return fileData.cards.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`${sourceFile}: cards[${index}] must be an object`);
    }

    const cardCardType = entry.card_type;

    if (cardCardType !== undefined) {
      const normalizedCardType = assertIntegerInRange(
        cardCardType,
        `cards[${index}].card_type`,
        CARD_TYPE_MIN,
        CARD_TYPE_MAX,
        sourceFile,
      );

      if (normalizedCardType !== cardType) {
        throw new Error(
          `${sourceFile}: cards[${index}].card_type (${normalizedCardType}) does not match file card_type (${cardType})`,
        );
      }
    }

    const explicitId = entry.id;
    const definitionId =
      explicitId === undefined
        ? index + 1
        : assertIntegerInRange(explicitId, `cards[${index}].id`, 1, DEFINITION_ID_MASK, sourceFile);

    return {
      ...entry,
      card_type: cardType,
      id: definitionId,
    };
  });
};

export const packDefinition = (cardType: number, definitionId: number): number => {
  const normalizedCardType = assertIntegerInRange(cardType, "cardType", CARD_TYPE_MIN, CARD_TYPE_MAX, "packDefinition");
  const normalizedDefinitionId = assertIntegerInRange(
    definitionId,
    "definitionId",
    1,
    DEFINITION_ID_MASK,
    "packDefinition",
  );

  return (normalizedCardType << 12) | normalizedDefinitionId;
};

export const unpackDefinition = (definition: number): { cardType: number; definitionId: number } => {
  const normalizedDefinition = assertIntegerInRange(definition, "definition", 0, 0xffff, "unpackDefinition");

  return {
    cardType: normalizedDefinition >> 12,
    definitionId: normalizedDefinition & DEFINITION_ID_MASK,
  };
};

export const loadCardDefinitions = async (): Promise<void> => {
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = Promise.resolve().then(() => {
    const nextByPacked = new Map<number, CardDefinition>();
    const nextByType = new Map<number, Map<number, CardDefinition>>();

    for (const [sourceFile, rawJson] of Object.entries(cardDefinitionFiles)) {
      const parsedCards = parseDefinitionFile(sourceFile, rawJson);

      for (const cardDefinition of parsedCards) {
        const packedDefinition = packDefinition(cardDefinition.card_type, cardDefinition.id);

        if (nextByPacked.has(packedDefinition)) {
          throw new Error(`Duplicate packed definition ${packedDefinition} found while reading ${sourceFile}`);
        }

        nextByPacked.set(packedDefinition, cardDefinition);

        let definitionsForType = nextByType.get(cardDefinition.card_type);

        if (!definitionsForType) {
          definitionsForType = new Map<number, CardDefinition>();
          nextByType.set(cardDefinition.card_type, definitionsForType);
        }

        definitionsForType.set(cardDefinition.id, cardDefinition);
      }
    }

    definitionsByPacked = nextByPacked;
    definitionsByType = nextByType;
  });

  return loadPromise;
};

export const getCardDefinition = (definition: number): CardDefinition | undefined => definitionsByPacked.get(definition);

export const getCardDefinitionByParts = (cardType: number, definitionId: number): CardDefinition | undefined => {
  if (!Number.isInteger(cardType) || !Number.isInteger(definitionId)) {
    return undefined;
  }

  return definitionsByType.get(cardType)?.get(definitionId);
};
