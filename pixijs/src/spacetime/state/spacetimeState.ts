import type { Player } from "../bindings/types";

export interface SpacetimeState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  cached_player: Map<number, Player>;
}

export const createSpacetimeState = (): SpacetimeState => ({
  observer_id: 0,
  viewed_id: 0,
  world_q: 0,
  world_r: 0,
  view_z: 0,
  cached_player: new Map<number, Player>(),
});
