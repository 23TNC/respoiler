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

// Stores tile identity plus runtime discriminator/type data.
#[table(accessor = tile, public)]
pub struct Tile {
    #[primary_key]
    pub tile_id: u32,
    pub definition_id: u16,
    pub tile_type: u16,
}

// Tracks world-positioned tiles and optional links to other tiles.
#[table(accessor = tile_tracker, public)]
pub struct TileTracker {
    #[primary_key]
    pub tile_id: u32,
    pub q: i32,
    pub r: i32,
    pub z: i32,
    pub linked_tile_id: u32,
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

// Tracks card placement/link state plus intrinsic/temporary movement locks.
#[table(accessor = card_tracker, public)]
pub struct CardTracker {
    #[primary_key]
    pub card_id: u32,
    pub linked_tile_id: u32,
    pub position_lock: bool,
    pub position_hold: bool,
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

enum TileTrackerTarget {
    Tile,
    Event,
    Slot,
}

fn validate_nonzero_id(id_name: &str, id: u32) -> Result<(), String> {
    if id == 0 {
        return Err(format!("{id_name} must not be 0"));
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
        TileTrackerTarget::Tile => {
            if ctx.db.event_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in event_tracker".to_string());
            }
            if ctx.db.slot_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in slot_tracker".to_string());
            }
        }
        TileTrackerTarget::Event => {
            if ctx.db.tile_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in tile_tracker".to_string());
            }
            if ctx.db.slot_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in slot_tracker".to_string());
            }
        }
        TileTrackerTarget::Slot => {
            if ctx.db.tile_tracker().tile_id().find(&tile_id).is_some() {
                return Err("tile_id already exists in tile_tracker".to_string());
            }
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

// Creates a new tile row.
#[reducer]
pub fn create_tile(
    ctx: &ReducerContext,
    tile_id: u32,
    definition_id: u16,
    tile_type: u16,
) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;

    if ctx.db.tile().tile_id().find(&tile_id).is_some() {
        return Err("tile already exists".to_string());
    }

    ctx.db.tile().insert(Tile {
        tile_id,
        definition_id,
        tile_type,
    });
    Ok(())
}

// Updates an existing tile row.
#[reducer]
pub fn update_tile(
    ctx: &ReducerContext,
    tile_id: u32,
    definition_id: u16,
    tile_type: u16,
) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;

    let existing = ctx
        .db
        .tile()
        .tile_id()
        .find(&tile_id)
        .ok_or("tile not found")?;
    ctx.db.tile().tile_id().update(Tile {
        definition_id,
        tile_type,
        ..existing
    });
    Ok(())
}

// Deletes a tile row.
#[reducer]
pub fn delete_tile(ctx: &ReducerContext, tile_id: u32) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    ctx.db.tile().tile_id().delete(&tile_id);
    Ok(())
}

// Inserts or updates tile tracking data with exclusivity checks.
#[reducer]
pub fn upsert_tile_tracker(
    ctx: &ReducerContext,
    tile_id: u32,
    q: i32,
    r: i32,
    z: i32,
    linked_tile_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;

    if let Some(existing) = ctx.db.tile_tracker().tile_id().find(&tile_id) {
        ctx.db.tile_tracker().tile_id().update(TileTracker {
            q,
            r,
            z,
            linked_tile_id,
            ..existing
        });
    } else {
        validate_tile_tracker_exclusivity(ctx, tile_id, TileTrackerTarget::Tile)?;
        ctx.db.tile_tracker().insert(TileTracker {
            tile_id,
            q,
            r,
            z,
            linked_tile_id,
        });
    }

    Ok(())
}

// Deletes a tile tracker row.
#[reducer]
pub fn delete_tile_tracker(ctx: &ReducerContext, tile_id: u32) -> Result<(), String> {
    validate_nonzero_id("tile_id", tile_id)?;
    ctx.db.tile_tracker().tile_id().delete(&tile_id);
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
    linked_tile_id: u32,
    position_lock: bool,
    position_hold: bool,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.card_tracker().card_id().find(&card_id) {
        ctx.db.card_tracker().card_id().update(CardTracker {
            linked_tile_id,
            position_lock,
            position_hold,
            ..existing
        });
    } else {
        ctx.db.card_tracker().insert(CardTracker {
            card_id,
            linked_tile_id,
            position_lock,
            position_hold,
        });
    }

    Ok(())
}

// Updates only the linked tile field for an existing card tracker row.
#[reducer]
pub fn update_card_tile(
    ctx: &ReducerContext,
    card_id: u32,
    linked_tile_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .card_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("card_tracker not found")?;
    ctx.db.card_tracker().card_id().update(CardTracker {
        linked_tile_id,
        ..existing
    });
    Ok(())
}

// Updates only the intrinsic position lock field for an existing card tracker row.
#[reducer]
pub fn update_card_position_lock(
    ctx: &ReducerContext,
    card_id: u32,
    position_lock: bool,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .card_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("card_tracker not found")?;
    ctx.db.card_tracker().card_id().update(CardTracker {
        position_lock,
        ..existing
    });
    Ok(())
}

// Updates only the temporary position hold field for an existing card tracker row.
#[reducer]
pub fn update_card_position_hold(
    ctx: &ReducerContext,
    card_id: u32,
    position_hold: bool,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    let existing = ctx
        .db
        .card_tracker()
        .card_id()
        .find(&card_id)
        .ok_or("card_tracker not found")?;
    ctx.db.card_tracker().card_id().update(CardTracker {
        position_hold,
        ..existing
    });
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
