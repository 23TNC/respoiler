import type { CardDefinition, CardInstance } from '../cards/types';

export interface DragCardPayload {
  card: CardDefinition;
  instance: CardInstance;
}
