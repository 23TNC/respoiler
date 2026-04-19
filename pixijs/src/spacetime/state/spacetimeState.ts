import type { Player, Zone } from "../bindings/types";

export interface SpacetimeState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  current_zone_id: number;
  cached_player: Map<number, Player>;
  cached_zone: Map<number, Zone>;
}

export const createSpacetimeState = (): SpacetimeState => ({
  observer_id: 0,
  viewed_id: 0,
  world_q: 0,
  world_r: 0,
  view_z: 0,
  current_zone_id: 0,
  cached_player: new Map<number, Player>(),
  cached_zone: new Map<number, Zone>(),
});
