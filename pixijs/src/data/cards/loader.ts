import rawCards from './base.cards.json';
import type { CardDefinition, CardGroup } from '../../game/cards/types';

function isCardGroup(value: unknown): value is CardGroup {
  return value === 'actions' || value === 'attributes' || value === 'items' || value === 'memories' || value === 'people';
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

    return {
      id: item.id,
      name: item.name,
      group: item.group,
    } satisfies CardDefinition;
  });

  return {
    cards,
    cardsById: new Map(cards.map((card) => [card.id, card])),
  };
}
