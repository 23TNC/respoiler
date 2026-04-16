use serde::Deserialize;
use spacetimedb::{reducer, table, ReducerContext, SpacetimeType, Table};


// Tile 1
// Event 2
// Slot 3

// Discipline   1
// Faculty      2
// Requisite    3
// Reverie      4
// Soul         5

#[derive(SpacetimeType)]
pub enum TileType {
    Tile,
    Event,
    Slot
}

// Stores a player and the root card that represents that player.
#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    pub player_id: u32,
    pub card_id: u32,
}

// Stores faction/group/permission alignment metadata for a card.
#[table(accessor = soul_alignment, public)]
pub struct SoulAlignment {
    #[primary_key]
    pub card_id: u32,
    pub faction_id: u32,
    pub group_id: u32,
    pub permissions: u64,
}

// Tracks event tiles with owning/related card and creation time.
#[table(accessor = event_tracker, public)]
pub struct EventTracker {
    #[primary_key]
    pub tile_id: u32,
    pub card_id: u32,
    pub create_time: i64,
}

// Tracks slot tiles with owning/related card and slot coordinate.
#[table(accessor = slot_tracker, public)]
pub struct SlotTracker {
    #[primary_key]
    pub tile_id: u32,
    pub card_id: u32,
    pub q: i32,
    pub r: i32,
}

// Stores card identity, definition, runtime type, and ownership hierarchy.
#[table(accessor = card, public)]
pub struct Card {
    #[primary_key]
    pub card_id: u32,
    pub definition_id: u16,
    pub card_type: u16,
    pub owner_card_id: u32,
}

// Tracks card placement and optional relationship links.
#[table(accessor = card_tracker, public)]
pub struct CardTracker {
    #[primary_key]
    pub card_id: u32,
    pub linked_card_id: u32,
    pub q: i32,
    pub r: i32,
    pub z: i32,
}

// Optional per-card action/recipe execution tracking.
#[table(accessor = action_tracker, public)]
pub struct ActionTracker {
    #[primary_key]
    pub card_id: u32,
    pub recipe_definition_id: u16,
    pub recipe_lock: bool,
    pub magnetic_inputs: String,
    pub queued_at: i64,
    pub started_at: i64,
    pub completed_at: i64,
}

// Dense per-card runtime status/flags; one row per card.
#[table(accessor = card_state, public)]
pub struct CardState {
  #[primary_key]
  pub card_id: u32,
  pub status: u64,
  pub flags: u64,
}

// Dense per-tile runtime status/flags; one row per tile.
#[table(accessor = tile_state, public)]
pub struct TileState {
  #[primary_key]
  pub tile_id: u32,
  pub status: u64,
  pub flags: u64,
}

// Sparse per-card variables with one row per (card_id, name) pair.
#[table(accessor = card_var, public)]
pub struct CardVar {
  #[primary_key]
  #[auto_inc]
  pub id: u64,
  pub card_id: u32,
  pub name: String,
  pub value: String,
}

// Sparse per-tile variables with one row per (tile_id, name) pair.
#[table(accessor = tile_var, public)]
pub struct TileVar {
  #[primary_key]
  #[auto_inc]
  pub id: u64,
  pub tile_id: u32,
  pub name: String,
  pub value: String,
}

enum TileTrackerTarget {
    Event,
    Slot,
}

#[derive(Deserialize, Default)]
struct BootstrapPayload {
    // Extend this payload with additional top-level table sections as new starter data is needed.
    player: Option<Vec<BootstrapPlayer>>,
    card: Option<Vec<BootstrapCard>>,
    card_tracker: Option<Vec<BootstrapCardTracker>>,
    action_tracker: Option<Vec<BootstrapActionTracker>>,
}

#[derive(Deserialize)]
struct BootstrapPlayer {
    player_id: u32,
    card_id: u32,
}

#[derive(Deserialize)]
struct BootstrapCard {
    card_id: u32,
    definition_id: u16,
    card_type: u16,
    owner_card_id: u32,
}

#[derive(Deserialize)]
struct BootstrapCardTracker {
    card_id: u32,
    linked_card_id: u32,
    q: i32,
    r: i32,
    z: i32,
}

#[derive(Deserialize)]
struct BootstrapActionTracker {
    card_id: u32,
    recipe_definition_id: u16,
    recipe_lock: bool,
    magnetic_inputs: String,
    queued_at: i64,
    started_at: i64,
    completed_at: i64,
}

fn read_bootstrap_json_contents() -> &'static str {
    // Keep this simple and deterministic: load a versioned JSON payload bundled with the module.
    include_str!("../bootstrap/bootstrap.json")
}

fn validate_nonzero_id(id_name: &str, id: u32) -> Result<(), String> {
    if id == 0 {
        return Err(format!("{id_name} must not be 0"));
    }
    Ok(())
}

// Seeds initial rows from bootstrap/bootstrap.json.
#[reducer]
pub fn bootstrap_from_json(ctx: &ReducerContext) -> Result<(), String> {
    let payload = serde_json::from_str::<BootstrapPayload>(read_bootstrap_json_contents())
        .map_err(|err| format!("failed to parse bootstrap/bootstrap.json: {err}"))?;

    // Dependency-safe load order:
    // 1) card 2) card_tracker 3) player 4) action_tracker

    for row in payload.card.unwrap_or_default() {
        if ctx.db.card().card_id().find(&row.card_id).is_none() {
            ctx.db.card().insert(Card {
                card_id: row.card_id,
                definition_id: row.definition_id,
                card_type: row.card_type,
                owner_card_id: row.owner_card_id,
            });
        }
    }

    for row in payload.card_tracker.unwrap_or_default() {
        if ctx.db.card_tracker().card_id().find(&row.card_id).is_none() {
            ctx.db.card_tracker().insert(CardTracker {
                card_id: row.card_id,
                linked_card_id: row.linked_card_id,
                q: row.q,
                r: row.r,
                z: row.z,
            });
        }
    }

    for row in payload.player.unwrap_or_default() {
        if ctx.db.player().player_id().find(&row.player_id).is_none() {
            ctx.db.player().insert(Player {
                player_id: row.player_id,
                card_id: row.card_id,
            });
        }
    }

    // Keep action_tracker in the format even if no initial rows are present yet.
    for row in payload.action_tracker.unwrap_or_default() {
        if ctx.db.action_tracker().card_id().find(&row.card_id).is_none() {
            ctx.db.action_tracker().insert(ActionTracker {
                card_id: row.card_id,
                recipe_definition_id: row.recipe_definition_id,
                recipe_lock: row.recipe_lock,
                magnetic_inputs: row.magnetic_inputs,
                queued_at: row.queued_at,
                started_at: row.started_at,
                completed_at: row.completed_at,
            });
        }
    }

    Ok(())
}

fn validate_not_self_owned_card(card_id: u32, owner_card_id: u32) -> Result<(), String> {
    if card_id == owner_card_id {
        return Err("owner_card_id must not equal card_id".to_string());
    }
    Ok(())
}

fn validate_tile_tracker_exclusivity(
    ctx: &ReducerContext,
    tile_id: u32,
    target: TileTrackerTarget,
) -> Result<(), String> {
    match target {
        TileTrackerTarget::Event => {
            if ctx.db.slot_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in slot_tracker".to_string());
            }
        }
        TileTrackerTarget::Slot => {
            if ctx.db.event_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in event_tracker".to_string());
            }
        }
    }

    Ok(())
}

// Creates a new player row.
#[reducer]
pub fn create_player(ctx: &ReducerContext, player_id: u32, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("player_id", player_id)?;
    validate_nonzero_id("card_id", card_id)?;

    if ctx.db.player().player_id().find(&player_id).is_some() {
        return Err("player already exists".to_string());
    }

    ctx.db.player().insert(Player { player_id, card_id });
    Ok(())
}

// Updates the root card for an existing player row.
#[reducer]
pub fn update_player_card(
    ctx: &ReducerContext,
    player_id: u32,
    card_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("player_id", player_id)?;
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .player()
        .player_id()
        .find(&player_id)
        .ok_or("player not found")?;

    ctx.db.player().player_id().update(Player {
        card_id,
        ..existing
    });
    Ok(())
}

// Deletes a player row if it exists.
#[reducer]
pub fn delete_player(ctx: &ReducerContext, player_id: u32) -> Result<(), String> {
    validate_nonzero_id("player_id", player_id)?;
    ctx.db.player().player_id().delete(&player_id);
    Ok(())
}

// Inserts or updates soul alignment metadata by card_id.
#[reducer]
pub fn upsert_soul_alignment(
    ctx: &ReducerContext,
    card_id: u32,
    faction_id: u32,
    group_id: u32,
    permissions: u64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.soul_alignment().card_id().find(&card_id) {
        ctx.db.soul_alignment().card_id().update(SoulAlignment {
            faction_id,
            group_id,
            permissions,
            ..existing
        });
    } else {
        ctx.db.soul_alignment().insert(SoulAlignment {
            card_id,
            faction_id,
            group_id,
            permissions,
        });
    }

    Ok(())
}

// Deletes soul alignment metadata by card_id.
#[reducer]
pub fn delete_soul_alignment(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.soul_alignment().card_id().delete(&card_id);
    Ok(())
}

// Inserts or updates event tracker data with exclusivity checks.
#[reducer]
pub fn upsert_event_tracker(
    ctx: &ReducerContext,
    tile_id: u32,
    card_id: u32,
    create_time: i64,
) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.event_tracker().tile_id().find(&tile_id) {
        ctx.db.event_tracker().tile_id().update(EventTracker {
            card_id,
            create_time,
            ..existing
        });
    } else {
        validate_tile_tracker_exclusivity(ctx, tile_id, TileTrackerTarget::Event)?;
        ctx.db.event_tracker().insert(EventTracker {
            tile_id,
            card_id,
            create_time,
        });
    }

    Ok(())
}

// Deletes an event tracker row.
#[reducer]
pub fn delete_event_tracker(ctx: &ReducerContext, tile_id: u32) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    ctx.db.event_tracker().tile_id().delete(&tile_id);
    Ok(())
}

// Inserts or updates slot tracker data with exclusivity checks.
#[reducer]
pub fn upsert_slot_tracker(
    ctx: &ReducerContext,
    tile_id: u32,
    card_id: u32,
    q: i32,
    r: i32,
) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.slot_tracker().tile_id().find(&tile_id) {
        ctx.db.slot_tracker().tile_id().update(SlotTracker {
            card_id,
            q,
            r,
            ..existing
        });
    } else {
        validate_tile_tracker_exclusivity(ctx, tile_id, TileTrackerTarget::Slot)?;
        ctx.db.slot_tracker().insert(SlotTracker {
            tile_id,
            card_id,
            q,
            r,
        });
    }

    Ok(())
}

// Deletes a slot tracker row.
#[reducer]
pub fn delete_slot_tracker(ctx: &ReducerContext, tile_id: u32) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    ctx.db.slot_tracker().tile_id().delete(&tile_id);
    Ok(())
}

// Creates a new card row and enforces self-ownership invariants.
#[reducer]
pub fn create_card(
    ctx: &ReducerContext,
    card_id: u32,
    definition_id: u16,
    card_type: u16,
    owner_card_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_not_self_owned_card(card_id, owner_card_id)?;

    if ctx.db.card().card_id().find(&card_id).is_some() {
        return Err("card already exists".to_string());
    }

    ctx.db.card().insert(Card {
        card_id,
        definition_id,
        card_type,
        owner_card_id,
    });
    Ok(())
}

// Updates an existing card row and enforces self-ownership invariants.
#[reducer]
pub fn update_card(
    ctx: &ReducerContext,
    card_id: u32,
    definition_id: u16,
    card_type: u16,
    owner_card_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_not_self_owned_card(card_id, owner_card_id)?;

    let existing = ctx
        .db
        .card()
        .card_id()
        .find(&card_id)
        .ok_or("card not found")?;
    ctx.db.card().card_id().update(Card {
        definition_id,
        card_type,
        owner_card_id,
        ..existing
    });
    Ok(())
}

// Deletes a card row.
#[reducer]
pub fn delete_card(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.card().card_id().delete(&card_id);
    Ok(())
}

// Inserts or updates card tracker state for a card.
#[reducer]
pub fn upsert_card_tracker(
    ctx: &ReducerContext,
    card_id: u32,
    linked_card_id: u32,
    q: i32,
    r: i32,
    z: i32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.card_tracker().card_id().find(&card_id) {
        ctx.db.card_tracker().card_id().update(CardTracker {
            linked_card_id,
            q,
            r,
            z,
            ..existing
        });
    } else {
        ctx.db.card_tracker().insert(CardTracker {
            card_id,
            linked_card_id,
            q,
            r,
            z,
        });
    }

    Ok(())
}

// Updates only the linked card field for an existing card tracker row.
#[reducer]
pub fn update_card_tile(
    ctx: &ReducerContext,
    card_id: u32,
    linked_card_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .card_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("card_tracker not found")?;
    ctx.db.card_tracker().card_id().update(CardTracker {
        linked_card_id,
        ..existing
    });
    Ok(())
}

const CARD_STATUS_POSITION_LOCK: u64 = 1 << 0;
const CARD_STATUS_POSITION_HOLD: u64 = 1 << 1;

// Updates only the intrinsic position lock flag in card_state.status.
#[reducer]
pub fn update_card_position_lock(
    ctx: &ReducerContext,
    card_id: u32,
    position_lock: bool,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    let existing = ctx.db.card_state().card_id().find(&card_id);
    let status = if let Some(state) = existing.as_ref() {
        if position_lock {
            state.status | CARD_STATUS_POSITION_LOCK
        } else {
            state.status & !CARD_STATUS_POSITION_LOCK
        }
    } else if position_lock {
        CARD_STATUS_POSITION_LOCK
    } else {
        0
    };

    if let Some(state) = existing {
        ctx.db.card_state().card_id().update(CardState { status, ..state });
    } else {
        ctx.db.card_state().insert(CardState {
            card_id,
            status,
            flags: 0,
        });
    }
    Ok(())
}

// Updates only the temporary position hold flag in card_state.status.
#[reducer]
pub fn update_card_position_hold(
    ctx: &ReducerContext,
    card_id: u32,
    position_hold: bool,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    let existing = ctx.db.card_state().card_id().find(&card_id);
    let status = if let Some(state) = existing.as_ref() {
        if position_hold {
            state.status | CARD_STATUS_POSITION_HOLD
        } else {
            state.status & !CARD_STATUS_POSITION_HOLD
        }
    } else if position_hold {
        CARD_STATUS_POSITION_HOLD
    } else {
        0
    };

    if let Some(state) = existing {
        ctx.db.card_state().card_id().update(CardState { status, ..state });
    } else {
        ctx.db.card_state().insert(CardState {
            card_id,
            status,
            flags: 0,
        });
    }
    Ok(())
}

// Deletes a card tracker row.
#[reducer]
pub fn delete_card_tracker(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.card_tracker().card_id().delete(&card_id);
    Ok(())
}

// Inserts or updates action tracker state; one row per card_id by primary key.
#[reducer]
pub fn upsert_action_tracker(
    ctx: &ReducerContext,
    card_id: u32,
    recipe_definition_id: u16,
    recipe_lock: bool,
    magnetic_inputs: String,
    queued_at: i64,
    started_at: i64,
    completed_at: i64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.action_tracker().card_id().find(&card_id) {
        ctx.db.action_tracker().card_id().update(ActionTracker {
            recipe_definition_id,
            recipe_lock,
            magnetic_inputs,
            queued_at,
            started_at,
            completed_at,
            ..existing
        });
    } else {
        ctx.db.action_tracker().insert(ActionTracker {
            card_id,
            recipe_definition_id,
            recipe_lock,
            magnetic_inputs,
            queued_at,
            started_at,
            completed_at,
        });
    }

    Ok(())
}

// Updates recipe-related action fields on an existing action tracker row.
#[reducer]
pub fn update_action_recipe(
    ctx: &ReducerContext,
    card_id: u32,
    recipe_definition_id: u16,
    recipe_lock: bool,
    magnetic_inputs: String,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .action_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("action_tracker not found")?;
    ctx.db.action_tracker().card_id().update(ActionTracker {
        recipe_definition_id,
        recipe_lock,
        magnetic_inputs,
        ..existing
    });
    Ok(())
}

// Updates queue/run timing fields on an existing action tracker row.
#[reducer]
pub fn update_action_queue_times(
    ctx: &ReducerContext,
    card_id: u32,
    queued_at: i64,
    started_at: i64,
    completed_at: i64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .action_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("action_tracker not found")?;
    ctx.db.action_tracker().card_id().update(ActionTracker {
        queued_at,
        started_at,
        completed_at,
        ..existing
    });
    Ok(())
}

// Deletes an action tracker row.
#[reducer]
pub fn delete_action_tracker(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.action_tracker().card_id().delete(&card_id);
    Ok(())
}

// Inserts or updates a dense card state row by card_id.
#[reducer]
pub fn set_card_state(
  ctx: &ReducerContext,
  card_id: u32,
  status: u64,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState {
      status,
      flags,
      ..existing
    });
  } else {
    ctx.db.card_state().insert(CardState {
      card_id,
      status,
      flags,
    });
  }

  Ok(())
}

// Deletes a dense card state row by card_id if present.
#[reducer]
pub fn delete_card_state(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;
  ctx.db.card_state().card_id().delete(&card_id);
  Ok(())
}

// Upserts only status in card_state while preserving flags.
#[reducer]
pub fn set_card_status(ctx: &ReducerContext, card_id: u32, status: u64) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState { status, ..existing });
  } else {
    ctx.db.card_state().insert(CardState {
      card_id,
      status,
      flags: 0,
    });
  }

  Ok(())
}

// Upserts only flags in card_state while preserving status.
#[reducer]
pub fn set_card_flags(ctx: &ReducerContext, card_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState { flags, ..existing });
  } else {
    ctx.db.card_state().insert(CardState {
      card_id,
      status: 0,
      flags,
    });
  }

  Ok(())
}

// Upserts by OR-ing bits into card_state.status.
#[reducer]
pub fn add_card_status_flags(
  ctx: &ReducerContext,
  card_id: u32,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState {
      status: existing.status | flags,
      ..existing
    });
  } else {
    ctx.db.card_state().insert(CardState {
      card_id,
      status: flags,
      flags: 0,
    });
  }

  Ok(())
}

// Clears bits from card_state.status if a row exists.
#[reducer]
pub fn remove_card_status_flags(
  ctx: &ReducerContext,
  card_id: u32,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState {
      status: existing.status & !flags,
      ..existing
    });
  }

  Ok(())
}

// Upserts by OR-ing bits into card_state.flags.
#[reducer]
pub fn add_card_flags(ctx: &ReducerContext, card_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState {
      flags: existing.flags | flags,
      ..existing
    });
  } else {
    ctx.db.card_state().insert(CardState {
      card_id,
      status: 0,
      flags,
    });
  }

  Ok(())
}

// Clears bits from card_state.flags if a row exists.
#[reducer]
pub fn remove_card_flags(ctx: &ReducerContext, card_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
    ctx.db.card_state().card_id().update(CardState {
      flags: existing.flags & !flags,
      ..existing
    });
  }

  Ok(())
}

// Inserts or updates a dense tile state row by tile_id.
#[reducer]
pub fn set_tile_state(
  ctx: &ReducerContext,
  tile_id: u32,
  status: u64,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState {
      status,
      flags,
      ..existing
    });
  } else {
    ctx.db.tile_state().insert(TileState {
      tile_id,
      status,
      flags,
    });
  }

  Ok(())
}

// Deletes a dense tile state row by tile_id if present.
#[reducer]
pub fn delete_tile_state(ctx: &ReducerContext, tile_id: u32) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;
  ctx.db.tile_state().tile_id().delete(&tile_id);
  Ok(())
}

// Upserts only status in tile_state while preserving flags.
#[reducer]
pub fn set_tile_status(ctx: &ReducerContext, tile_id: u32, status: u64) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState { status, ..existing });
  } else {
    ctx.db.tile_state().insert(TileState {
      tile_id,
      status,
      flags: 0,
    });
  }

  Ok(())
}

// Upserts only flags in tile_state while preserving status.
#[reducer]
pub fn set_tile_flags(ctx: &ReducerContext, tile_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState { flags, ..existing });
  } else {
    ctx.db.tile_state().insert(TileState {
      tile_id,
      status: 0,
      flags,
    });
  }

  Ok(())
}

// Upserts by OR-ing bits into tile_state.status.
#[reducer]
pub fn add_tile_status_flags(
  ctx: &ReducerContext,
  tile_id: u32,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState {
      status: existing.status | flags,
      ..existing
    });
  } else {
    ctx.db.tile_state().insert(TileState {
      tile_id,
      status: flags,
      flags: 0,
    });
  }

  Ok(())
}

// Clears bits from tile_state.status if a row exists.
#[reducer]
pub fn remove_tile_status_flags(
  ctx: &ReducerContext,
  tile_id: u32,
  flags: u64,
) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState {
      status: existing.status & !flags,
      ..existing
    });
  }

  Ok(())
}

// Upserts by OR-ing bits into tile_state.flags.
#[reducer]
pub fn add_tile_flags(ctx: &ReducerContext, tile_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState {
      flags: existing.flags | flags,
      ..existing
    });
  } else {
    ctx.db.tile_state().insert(TileState {
      tile_id,
      status: 0,
      flags,
    });
  }

  Ok(())
}

// Clears bits from tile_state.flags if a row exists.
#[reducer]
pub fn remove_tile_flags(ctx: &ReducerContext, tile_id: u32, flags: u64) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  if let Some(existing) = ctx.db.tile_state().tile_id().find(&tile_id) {
    ctx.db.tile_state().tile_id().update(TileState {
      flags: existing.flags & !flags,
      ..existing
    });
  }

  Ok(())
}

// Inserts or updates a sparse card variable row by (card_id, name).
#[reducer]
pub fn set_card_var(
  ctx: &ReducerContext,
  card_id: u32,
  name: String,
  value: String,
) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  let mut existing_ids = Vec::new();
  for row in ctx.db.card_var().iter() {
    if row.card_id == card_id && row.name == name {
      existing_ids.push(row.id);
    }
  }

  if let Some(existing_id) = existing_ids.first() {
    if let Some(existing) = ctx.db.card_var().id().find(existing_id) {
      ctx.db.card_var().id().update(CardVar {
        value,
        ..existing
      });
    }

    for duplicate_id in &existing_ids[1..] {
      ctx.db.card_var().id().delete(duplicate_id);
    }
  } else {
    ctx.db.card_var().insert(CardVar {
      id: 0,
      card_id,
      name,
      value,
    });
  }

  Ok(())
}

// Deletes a sparse card variable row by (card_id, name) if present.
#[reducer]
pub fn delete_card_var(ctx: &ReducerContext, card_id: u32, name: String) -> Result<(), String> {
  validate_nonzero_id("card_id", card_id)?;

  let mut ids_to_delete = Vec::new();
  for row in ctx.db.card_var().iter() {
    if row.card_id == card_id && row.name == name {
      ids_to_delete.push(row.id);
    }
  }

  for id in ids_to_delete {
    ctx.db.card_var().id().delete(&id);
  }

  Ok(())
}

// Inserts or updates a sparse tile variable row by (tile_id, name).
#[reducer]
pub fn set_tile_var(
  ctx: &ReducerContext,
  tile_id: u32,
  name: String,
  value: String,
) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  let mut existing_ids = Vec::new();
  for row in ctx.db.tile_var().iter() {
    if row.tile_id == tile_id && row.name == name {
      existing_ids.push(row.id);
    }
  }

  if let Some(existing_id) = existing_ids.first() {
    if let Some(existing) = ctx.db.tile_var().id().find(existing_id) {
      ctx.db.tile_var().id().update(TileVar {
        value,
        ..existing
      });
    }

    for duplicate_id in &existing_ids[1..] {
      ctx.db.tile_var().id().delete(duplicate_id);
    }
  } else {
    ctx.db.tile_var().insert(TileVar {
      id: 0,
      tile_id,
      name,
      value,
    });
  }

  Ok(())
}

// Deletes a sparse tile variable row by (tile_id, name) if present.
#[reducer]
pub fn delete_tile_var(ctx: &ReducerContext, tile_id: u32, name: String) -> Result<(), String> {
  validate_nonzero_id("tile_id", tile_id)?;

  let mut ids_to_delete = Vec::new();
  for row in ctx.db.tile_var().iter() {
    if row.tile_id == tile_id && row.name == name {
      ids_to_delete.push(row.id);
    }
  }

  for id in ids_to_delete {
    ctx.db.tile_var().id().delete(&id);
  }

  Ok(())
}
