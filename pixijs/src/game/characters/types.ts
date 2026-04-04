import type { CardGroup, CardInstance } from '../cards/types';

export type SubordinateType = 'Control' | 'Influence' | 'Observe';

export interface SoulModel {
  soulId: string;
  name: string;
  playerId?: string;
  ownerSoulId?: string;
  subordinateType?: SubordinateType;
}

export interface CharacterInventory {
  techniques: CardInstance[];
  essence: CardInstance[];
  sundries: CardInstance[];
  reveries: CardInstance[];
  souls: CardInstance[];
}

export interface CharacterModel {
  id: string;
  name: string;
  playerSoulId: string;
  souls: SoulModel[];
  inventoryBySoulId: Record<string, CharacterInventory>;
}

export const INVENTORY_GROUP_ORDER: CardGroup[] = ['techniques', 'essence', 'sundries', 'reveries', 'souls'];
