import type { Action, Card, Player, Zone } from "../bindings/types";
import type { InventoryCardsByPanel } from "../inventory";
import type { LocalCard, LocalCardKey } from "../localCards";

export interface SpacetimeState {
  observer_id: number;
  viewed_id: number;
  world_q: number;
  world_r: number;
  view_z: number;
  current_zone_id: number;
  visible_zone_ids: number[];
  cached_players: Map<number, Player>;
  cached_cards: Map<number, Card>;
  cached_zones: Map<number, Zone>;
  cached_actions: Map<number, Action>;
  local_cards: Map<LocalCardKey, LocalCard>;
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
  cached_players: new Map<number, Player>(),
  cached_cards: new Map<number, Card>(),
  cached_zones: new Map<number, Zone>(),
  cached_actions: new Map<number, Action>(),
  local_cards: new Map<LocalCardKey, LocalCard>(),
  inventory_cards: {
    disciplinesPanel: [],
    facultiesPanel: [],
    requisitesPanel: [],
    reveriesPanel: [],
    soulsPanel: [],
  },
});
