import rawCards from './base.cards.json';
import type { CardDefinition, CardGroup } from '../../game/cards/types';

function isCardGroup(value: unknown): value is CardGroup {
  return value === 'techniques' || value === 'essence' || value === 'sundries' || value === 'reveries' || value === 'souls';
}

export function loadCardDefinitions(): { cards: CardDefinition[]; cardsById: Map<string, CardDefinition> } {
  const cards = (rawCards as unknown[]).map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Invalid card at index ${index}`);
    }

    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || !isCardGroup(item.group)) {
      throw new Error(`Malformed card definition at index ${index}`);
    }

    const parsedColor = parseColor(item.backgroundColor);
    if (parsedColor === null) {
      throw new Error(`Malformed backgroundColor for card "${item.id}" at index ${index}`);
    }

    return {
      id: item.id,
      name: item.name,
      group: item.group,
      backgroundColor: parsedColor,
    } satisfies CardDefinition;
  });

  return {
    cards,
    cardsById: new Map(cards.map((card) => [card.id, card])),
  };
}

function parseColor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return Number.parseInt(normalized, 16);
}
