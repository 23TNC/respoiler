// cards.rs

use spacetimedb::{ReducerContext, Table};
use crate::packing::{pack_position, pack_zone, world_to_position, world_to_zone};

#[spacetimedb::table(accessor = cards, public)]
#[derive(Debug, Clone)]
pub struct Card {
  #[primary_key]
  pub card_id: u32,
  pub definition: u16,
  #[index(btree)]
  pub link: u32,
  pub flags: u64,
  #[index(btree)]
  pub zone: u32,
  pub position: u8,
}

#[spacetimedb::reducer]
pub fn upsert_card(
  ctx: &ReducerContext,
  card_id: u32,
  definition: u16,
  link: u32,
  flags: u64,
  q: i32,
  r: i32,
  z: u16,
) -> Result<(), String> {
  let (zone_q, zone_r) = world_to_zone(q, r);
  let (pos_q, pos_r) = world_to_position(q, r);

  let zone = pack_zone(zone_q, zone_r, z);
  let position = pack_position(pos_q, pos_r);

  if ctx.db.cards().card_id().find(&card_id).is_some() {
    ctx.db.cards().card_id().update(Card {
      card_id,
      definition,
      link,
      flags,
      zone,
      position,
    });
  } else {
    ctx.db.cards().insert(Card {
      card_id,
      definition,
      link,
      flags,
      zone,
      position,
    });
  }

  Ok(())
}

#[spacetimedb::reducer]
pub fn update_card_link(
  ctx: &ReducerContext,
  card_id: u32,
  link: u32,
) -> Result<(), String> {
  if let Some(mut row) = ctx.db.cards().card_id().find(&card_id) {
    row.link = link;
    ctx.db.cards().card_id().update(row);
    Ok(())
  } else {
    Err(format!("card {card_id} not found"))
  }
}

#[spacetimedb::reducer]
pub fn set_card_flags(
  ctx: &ReducerContext,
  card_id: u32,
  flags: u64,
) -> Result<(), String> {
  if let Some(mut row) = ctx.db.cards().card_id().find(&card_id) {
    row.flags = flags;
    ctx.db.cards().card_id().update(row);
    Ok(())
  } else {
    Err(format!("card {card_id} not found"))
  }
}

#[spacetimedb::reducer]
pub fn update_card_location(
  ctx: &ReducerContext,
  card_id: u32,
  q: i32,
  r: i32,
  z: u16,
) -> Result<(), String> {
  let (zone_q, zone_r) = world_to_zone(q, r);
  let (pos_q, pos_r) = world_to_position(q, r);

  let zone = pack_zone(zone_q, zone_r, z);
  let position = pack_position(pos_q, pos_r);

  if let Some(mut row) = ctx.db.cards().card_id().find(&card_id) {
    row.zone = zone;
    row.position = position;
    ctx.db.cards().card_id().update(row);
    Ok(())
  } else {
    Err(format!("card {card_id} not found"))
  }
}

#[spacetimedb::reducer]
pub fn delete_card(
  ctx: &ReducerContext,
  card_id: u32,
) -> Result<(), String> {
  ctx.db.cards().card_id().delete(&card_id);
  Ok(())
}