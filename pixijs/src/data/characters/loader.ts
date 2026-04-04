import rawCharacter from './mock.character.json';
import type { CharacterInventory, CharacterModel, SoulModel, SubordinateType } from '../../game/characters/types';

function isSubordinateType(value: unknown): value is SubordinateType {
  return value === 'Control' || value === 'Influence' || value === 'Observe';
}

function isSoul(value: unknown): value is SoulModel {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const soul = value as Record<string, unknown>;
  if (typeof soul.soulId !== 'string' || typeof soul.name !== 'string') {
    return false;
  }

  if (soul.playerId !== undefined && typeof soul.playerId !== 'string') {
    return false;
  }

  if (soul.ownerSoulId !== undefined && typeof soul.ownerSoulId !== 'string') {
    return false;
  }

  if (soul.subordinateType !== undefined && !isSubordinateType(soul.subordinateType)) {
    return false;
  }

  return true;
}

function isCardInstance(value: unknown): value is { instanceId: string; cardId: string; soulId: string; linkedSoulId?: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.instanceId === 'string'
    && typeof item.cardId === 'string'
    && typeof item.soulId === 'string'
    && (item.linkedSoulId === undefined || typeof item.linkedSoulId === 'string')
  );
}

function isInventory(value: unknown): value is CharacterInventory {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const inventory = value as Record<string, unknown>;
  const groups = ['techniques', 'essence', 'sundries', 'reveries', 'souls'] as const;
  for (const group of groups) {
    const list = inventory[group];
    if (!Array.isArray(list) || !list.every(isCardInstance)) {
      return false;
    }
  }

  return true;
}

function isHostedTile(value: unknown): value is { id: string; tileType: string; eventLabel: string; activeVerbs: string[] } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const tile = value as Record<string, unknown>;
  return (
    typeof tile.id === 'string'
    && typeof tile.tileType === 'string'
    && typeof tile.eventLabel === 'string'
    && Array.isArray(tile.activeVerbs)
    && tile.activeVerbs.every((verbId) => typeof verbId === 'string')
  );
}

export function loadSelectedCharacter(): CharacterModel {
  const data = rawCharacter as Record<string, unknown>;

  if (typeof data.id !== 'string' || typeof data.name !== 'string' || typeof data.playerSoulId !== 'string') {
    throw new Error('Invalid mock character');
  }

  if (!Array.isArray(data.souls) || !data.souls.every(isSoul)) {
    throw new Error('Invalid mock souls list');
  }

  if (typeof data.inventoryBySoulId !== 'object' || data.inventoryBySoulId === null) {
    throw new Error('Invalid inventoryBySoulId');
  }
  if (typeof data.hostedTilesBySoulId !== 'object' || data.hostedTilesBySoulId === null) {
    throw new Error('Invalid hostedTilesBySoulId');
  }

  const inventoryBySoulId = data.inventoryBySoulId as Record<string, unknown>;
  const hostedTilesBySoulId = data.hostedTilesBySoulId as Record<string, unknown>;
  for (const soul of data.souls) {
    if (!isInventory(inventoryBySoulId[soul.soulId])) {
      throw new Error(`Invalid character inventory for soul: ${soul.soulId}`);
    }
    const hostedTiles = hostedTilesBySoulId[soul.soulId];
    if (!Array.isArray(hostedTiles) || !hostedTiles.every(isHostedTile)) {
      throw new Error(`Invalid hosted tiles for soul: ${soul.soulId}`);
    }
  }

  return {
    id: data.id,
    name: data.name,
    playerSoulId: data.playerSoulId,
    souls: data.souls,
    inventoryBySoulId: inventoryBySoulId as CharacterModel['inventoryBySoulId'],
    hostedTilesBySoulId: hostedTilesBySoulId as CharacterModel['hostedTilesBySoulId'],
  };
}
