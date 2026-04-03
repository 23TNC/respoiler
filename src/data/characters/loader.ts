import rawCharacter from './mock.character.json';
import type { CharacterModel } from '../../game/characters/types';

function isCardInstance(value: unknown): value is { instanceId: string; cardId: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.instanceId === 'string' && typeof item.cardId === 'string';
}

export function loadSelectedCharacter(): CharacterModel {
  const data = rawCharacter as Record<string, unknown>;

  if (typeof data.id !== 'string' || typeof data.name !== 'string') {
    throw new Error('Invalid mock character');
  }

  const inventory = data.inventory as Record<string, unknown>;
  const groups = ['actions', 'attributes', 'items', 'memories', 'people'] as const;

  for (const group of groups) {
    const list = inventory[group];
    if (!Array.isArray(list) || !list.every(isCardInstance)) {
      throw new Error(`Invalid character inventory group: ${group}`);
    }
  }

  return {
    id: data.id,
    name: data.name,
    inventory: {
      actions: inventory.actions as CharacterModel['inventory']['actions'],
      attributes: inventory.attributes as CharacterModel['inventory']['attributes'],
      items: inventory.items as CharacterModel['inventory']['items'],
      memories: inventory.memories as CharacterModel['inventory']['memories'],
      people: inventory.people as CharacterModel['inventory']['people'],
    },
  };
}
