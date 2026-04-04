export type CardGroup = 'techniques' | 'essence' | 'sundries' | 'reveries' | 'souls';

export type CardInstanceState = 'in_inventory' | 'staged' | 'queued';

export interface CardDefinition {
  id: string;
  name: string;
  group: CardGroup;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
}
