export type CardGroup = 'actions' | 'attributes' | 'items' | 'memories' | 'people';

export interface CardDefinition {
  id: string;
  name: string;
  group: CardGroup;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
}
