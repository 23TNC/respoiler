use spacetimedb::{reducer, ReducerContext, Table};
use crate::cards::insert_card_row;
use crate::packing::{pack_position, pack_zone, world_to_position, world_to_zone};

#[spacetimedb::table(accessor = players, public)]
#[derive(Debug, Clone)]
pub struct Player {
  #[primary_key]
  #[auto_inc]
  pub player_id: u32,
  #[unique]
  pub name: String,
  #[index(btree)]
  pub card_id: u32,
  #[index(btree)]
  pub zone: u32,
  pub position: u8,
}

#[reducer]
pub fn upsert_player(
  ctx: &ReducerContext,
  name: String,
  card_type: u8,
  definition_id: u16,
  flags: u64,
  q: i32,
  r: i32,
  z: u16,
) -> Result<(), String> {
  let (zone_q, zone_r) = world_to_zone(q, r);
  let (pos_q, pos_r) = world_to_position(q, r);

  let zone = pack_zone(zone_q, zone_r, z);
  let position = pack_position(pos_q, pos_r);

  let soul_card_id = insert_card_row(
    ctx,
    card_type,
    definition_id,
    0,
    flags,
    0,
    0,
    0,
  )?;

  ctx.db.players().try_insert(Player {
    player_id: 0,
    name,
    card_id: soul_card_id,
    zone,
    position,
  })?;

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
