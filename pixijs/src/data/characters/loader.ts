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
  const groups = ['techniques', 'essence', 'sundries', 'reveries', 'souls'] as const;

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
      techniques: inventory.techniques as CharacterModel['inventory']['techniques'],
      essence: inventory.essence as CharacterModel['inventory']['essence'],
      sundries: inventory.sundries as CharacterModel['inventory']['sundries'],
      reveries: inventory.reveries as CharacterModel['inventory']['reveries'],
      souls: inventory.souls as CharacterModel['inventory']['souls'],
    },
  };
}
