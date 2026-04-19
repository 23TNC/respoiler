import type { Player } from "../bindings/types";

export interface SpacetimeState {
  observer_id: number;
  viewed_id: number;
  playersById: Map<number, Player>;
}

export const createSpacetimeState = (): SpacetimeState => ({
  observer_id: 0,
  viewed_id: 0,
  playersById: new Map<number, Player>(),
});
