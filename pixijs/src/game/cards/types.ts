export type CardGroup = 'techniques' | 'essence' | 'sundries' | 'reveries' | 'souls';

export type CardInstanceState = 'in_inventory' | 'staged' | 'queued';

export interface CardDefinition {
  id: string;
  name: string;
  group: CardGroup;
  backgroundColor: number;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
  soulId: string;
  linkedSoulId?: string;
}

export const CARD_GROUP_LABEL: Record<CardGroup, string> = {
  techniques: 'Techniques',
  essence: 'Essence',
  sundries: 'Sundries',
  reveries: 'Reveries',
  souls: 'Souls',
};
