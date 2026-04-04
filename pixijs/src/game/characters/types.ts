import type { CardGroup, CardInstance } from '../cards/types';

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
  inventory: CharacterInventory;
}

export const INVENTORY_GROUP_ORDER: CardGroup[] = ['techniques', 'essence', 'sundries', 'reveries', 'souls'];
