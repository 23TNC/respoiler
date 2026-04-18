// players.rs

use spacetimedb::{reducer, ReducerContext, Table};
use crate::packing::{pack_zone, pack_position, world_to_zone, world_to_position};

#[spacetimedb::table(accessor = players, public)]
#[derive(Debug, Clone)]
pub struct Player {
  #[primary_key]
  pub player_id: u32,
  #[index(btree)]
  pub card_id: u32,
  #[index(btree)]
  pub zone: u32,
  pub position: u8,
}

#[reducer]
pub fn upsert_player(
  ctx: &ReducerContext,
  player_id: u32,
  card_id: u32,
  q: i32,
  r: i32,
  z: u16,
) -> Result<(), String> {
  let (zone_q, zone_r) = world_to_zone(q, r);
  let (pos_q, pos_r) = world_to_position(q, r);

  let zone = pack_zone(zone_q, zone_r, z);
  let position = pack_position(pos_q, pos_r);

  if ctx.db.players().player_id().find(&player_id).is_some() {
    ctx.db.players().player_id().update(Player {
      player_id,
      card_id,
      zone,
      position
    });
  } else {
    ctx.db.players().insert(Player {
      player_id,
      card_id,
      zone,
      position,
    });
  }

  Ok(())
}

#[reducer]
pub fn delete_player(
  ctx: &ReducerContext,
  player_id: u32,
) -> Result<(), String> {
  ctx.db.players().player_id().delete(&player_id);
  Ok(())
}