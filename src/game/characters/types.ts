import type { CardGroup, CardInstance } from '../cards/types';

export interface CharacterInventory {
  actions: CardInstance[];
  attributes: CardInstance[];
  items: CardInstance[];
  memories: CardInstance[];
  people: CardInstance[];
}

export interface CharacterModel {
  id: string;
  name: string;
  inventory: CharacterInventory;
}

export const INVENTORY_GROUP_ORDER: CardGroup[] = ['actions', 'attributes', 'items', 'memories', 'people'];
