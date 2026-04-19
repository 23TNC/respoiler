import type { Player, Zone } from "../bindings/types";
import type { InventoryCardsByPanel } from "../inventory";

export interface SpacetimeState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  current_zone_id: number;
  visible_zone_ids: number[];
  cached_player: Map<number, Player>;
  cached_zone: Map<number, Zone>;
  inventory_cards: InventoryCardsByPanel;
}

export const createSpacetimeState = (): SpacetimeState => ({
  observer_id: 0,
  viewed_id: 0,
  world_q: 0,
  world_r: 0,
  view_z: 0,
  current_zone_id: 0,
  visible_zone_ids: [],
  cached_player: new Map<number, Player>(),
  cached_zone: new Map<number, Zone>(),
  inventory_cards: {
    disciplinesPanel: [],
    facultiesPanel: [],
    requisitesPanel: [],
    reveriesPanel: [],
    soulsPanel: [],
  },
});
