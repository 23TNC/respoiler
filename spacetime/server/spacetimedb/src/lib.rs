use serde::Deserialize;
use spacetimedb::{reducer, table, ReducerContext, Table};

// Discipline   1
// Faculty      2
// Requisite    3
// Reverie      4
// Soul         5
// Tile         6
// Event        7
// Slot         8

// Stores a player and the root card that represents that player.
#[table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    #[auto_inc]
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

// Optional per-card action/recipe execution tracking.
#[table(accessor = action_tracker, public)]
pub struct ActionTracker {
    #[primary_key]
    pub card_id: u32,
    pub recipe_definition_id: u16,
    pub queued_at: i64,
    pub started_at: i64,
    pub completed_at: i64,
}

// Stores card identity, definition, runtime type, and ownership hierarchy.
#[table(accessor = card, public)]
pub struct Card {
    #[primary_key]
    #[auto_inc]
    pub card_id: u32,
    pub definition_id: u16,
    pub card_type: u16,
    pub owner_card_id: u32,
}

// Tracks spatial position for cards that exist in world space.
#[table(accessor = card_position, public)]
pub struct CardPosition {
    #[primary_key]
    pub card_id: u32,
    pub q: i32,
    pub r: i32,
    pub z: i32,
}

// Tracks card-to-card linkage relationships.
#[table(accessor = card_link, public)]
pub struct CardLink {
    #[primary_key]
    pub card_id: u32,
    #[index(btree)]
    pub linked_card_id: u32,
}

// Dense per-card runtime bit banks; one row per card.
#[table(accessor = card_state, public)]
pub struct CardState {
    #[primary_key]
    pub card_id: u32,
    pub bits_0: u64,
    pub bits_1: u64,
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

#[derive(Deserialize, Default)]
struct BootstrapPayload {
    // Extend this payload with additional top-level table sections as new starter data is needed.
    player: Option<Vec<BootstrapPlayer>>,
    card: Option<Vec<BootstrapCard>>,
    card_position: Option<Vec<BootstrapCardPosition>>,
    card_link: Option<Vec<BootstrapCardLink>>,
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
struct BootstrapCardPosition {
    card_id: u32,
    q: i32,
    r: i32,
    z: i32,
}

#[derive(Deserialize)]
struct BootstrapCardLink {
    card_id: u32,
    linked_card_id: u32,
}

#[derive(Deserialize)]
struct BootstrapActionTracker {
    card_id: u32,
    recipe_definition_id: u16,
    queued_at: i64,
    started_at: i64,
    completed_at: i64,
}

fn validate_nonzero_id(id_name: &str, id: u32) -> Result<(), String> {
    if id == 0 {
        return Err(format!("{id_name} must not be 0"));
    }
    Ok(())
}

fn validate_bank(bank: u8) -> Result<(), String> {
    if bank > 1 {
        return Err("bank must be 0 or 1".to_string());
    }
    Ok(())
}

fn get_bank_value(state: &CardState, bank: u8) -> Result<u64, String> {
    match bank {
        0 => Ok(state.bits_0),
        1 => Ok(state.bits_1),
        _ => Err("bank must be 0 or 1".to_string()),
    }
}

fn with_bank_value(state: CardState, bank: u8, value: u64) -> Result<CardState, String> {
    match bank {
        0 => Ok(CardState { bits_0: value, ..state }),
        1 => Ok(CardState { bits_1: value, ..state }),
        _ => Err("bank must be 0 or 1".to_string()),
    }
}

fn new_card_state(card_id: u32) -> CardState {
    CardState {
        card_id,
        bits_0: 0,
        bits_1: 0,
    }
}

// Seeds initial rows from bootstrap/bootstrap.json.
#[reducer]
pub fn bootstrap(ctx: &ReducerContext) -> Result<(), String> {
    let payload = serde_json::from_str::<BootstrapPayload>(read_bootstrap_json_contents())
        .map_err(|err| format!("failed to parse bootstrap/bootstrap.json: {err}"))?;

    // Dependency-safe load order:
    // 1) card 2) card_position 3) card_link 4) player 5) action_tracker

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

    for row in payload.card_position.unwrap_or_default() {
        if ctx.db.card_position().card_id().find(&row.card_id).is_none() {
            ctx.db.card_position().insert(CardPosition {
                card_id: row.card_id,
                q: row.q,
                r: row.r,
                z: row.z,
            });
        }
    }

    for row in payload.card_link.unwrap_or_default() {
        if ctx.db.card_link().card_id().find(&row.card_id).is_none() {
            ctx.db.card_link().insert(CardLink {
                card_id: row.card_id,
                linked_card_id: row.linked_card_id,
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

// Inserts or updates card position state for a card.
#[reducer]
pub fn upsert_card_position(
    ctx: &ReducerContext,
    card_id: u32,
    q: i32,
    r: i32,
    z: i32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.card_position().card_id().find(&card_id) {
        ctx.db.card_position().card_id().update(CardPosition {
            q,
            r,
            z,
            ..existing
        });
    } else {
        ctx.db.card_position().insert(CardPosition { card_id, q, r, z });
    }

    Ok(())
}

// Deletes a card position row.
#[reducer]
pub fn delete_card_position(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.card_position().card_id().delete(&card_id);
    Ok(())
}

fn validate_card_link(
    ctx: &ReducerContext,
    card_id: u32,
    linked_card_id: u32,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_nonzero_id("linked_card_id", linked_card_id)?;

    if card_id == linked_card_id {
        return Err("card_id must not equal linked_card_id".to_string());
    }

    let source = ctx
        .db
        .card()
        .card_id()
        .find(&card_id)
        .ok_or("source card not found")?;

    let destination = ctx
        .db
        .card()
        .card_id()
        .find(&linked_card_id)
        .ok_or("destination card not found")?;

    // Only enforce the "one discipline per soul per tile/event/slot" rule when:
    // - the source card is a discipline (type 1)
    // - the destination is a tile/event/slot (types 6..=8)
    if source.card_type == 1 && (6..=8).contains(&destination.card_type) {
        for row in ctx.db.card_link().linked_card_id().filter(&linked_card_id) {
            if row.card_id == card_id {
                continue;
            }

            let existing = ctx
                .db
                .card()
                .card_id()
                .find(&row.card_id)
                .ok_or("linked source card not found")?;

            // Ignore cards owned by other souls.
            if existing.owner_card_id != source.owner_card_id {
                continue;
            }

            // Reject if this soul already has a discipline linked here.
            if existing.card_type == 1 {
                return Err("soul already has a discipline linked to this destination".to_string());
            }
        }
    }

    Ok(())
}

#[reducer]
pub fn upsert_card_link(
    ctx: &ReducerContext,
    card_id: u32,
    linked_card_id: u32,
) -> Result<(), String> {
    validate_card_link(ctx, card_id, linked_card_id)?;

    if let Some(existing) = ctx.db.card_link().card_id().find(&card_id) {
        ctx.db.card_link().card_id().update(CardLink {
            linked_card_id,
            ..existing
        });
    } else {
        ctx.db.card_link().insert(CardLink {
            card_id,
            linked_card_id,
        });
    }

    Ok(())
}

// Deletes a card link row.
#[reducer]
pub fn delete_card_link(ctx: &ReducerContext, card_id: u32) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    ctx.db.card_link().card_id().delete(&card_id);
    Ok(())
}

// Inserts or updates action tracker state; one row per card_id by primary key.
#[reducer]
pub fn upsert_action_tracker(
    ctx: &ReducerContext,
    card_id: u32,
    recipe_definition_id: u16,
    queued_at: i64,
    started_at: i64,
    completed_at: i64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.action_tracker().card_id().find(&card_id) {
        ctx.db.action_tracker().card_id().update(ActionTracker {
            recipe_definition_id,
            queued_at,
            started_at,
            completed_at,
            ..existing
        });
    } else {
        ctx.db.action_tracker().insert(ActionTracker {
            card_id,
            recipe_definition_id,
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

// Inserts or updates all card_state bit banks for a card.
#[reducer]
pub fn set_card_state(
    ctx: &ReducerContext,
    card_id: u32,
    bits_0: u64,
    bits_1: u64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;

    if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
        ctx.db.card_state().card_id().update(CardState {
            bits_0,
            bits_1,
            ..existing
        });
    } else {
        ctx.db.card_state().insert(CardState {
            card_id,
            bits_0,
            bits_1,
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

// Upserts one card_state bit bank by index while preserving the others.
#[reducer]
pub fn set_card_bits(
    ctx: &ReducerContext,
    card_id: u32,
    bank: u8,
    value: u64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_bank(bank)?;

    if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
        let updated = with_bank_value(existing, bank, value)?;
        ctx.db.card_state().card_id().update(updated);
    } else {
        let state = with_bank_value(new_card_state(card_id), bank, value)?;
        ctx.db.card_state().insert(state);
    }

    Ok(())
}

// Upserts one card_state bit bank by OR-ing in bits.
#[reducer]
pub fn add_card_bits(
    ctx: &ReducerContext,
    card_id: u32,
    bank: u8,
    flags: u64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_bank(bank)?;

    if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
        let current = get_bank_value(&existing, bank)?;
        let updated = with_bank_value(existing, bank, current | flags)?;
        ctx.db.card_state().card_id().update(updated);
    } else {
        let state = with_bank_value(new_card_state(card_id), bank, flags)?;
        ctx.db.card_state().insert(state);
    }

    Ok(())
}

// Clears bits from one card_state bit bank if a row exists.
#[reducer]
pub fn remove_card_bits(
    ctx: &ReducerContext,
    card_id: u32,
    bank: u8,
    flags: u64,
) -> Result<(), String> {
    validate_nonzero_id("card_id", card_id)?;
    validate_bank(bank)?;

    if let Some(existing) = ctx.db.card_state().card_id().find(&card_id) {
        let current = get_bank_value(&existing, bank)?;
        let updated = with_bank_value(existing, bank, current & !flags)?;
        ctx.db.card_state().card_id().update(updated);
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
            ctx.db.card_var().id().update(CardVar { value, ..existing });
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

fn read_bootstrap_json_contents() -> &'static str {
    // Keep this simple and deterministic: load a versioned JSON payload bundled with the module.
    include_str!("../bootstrap/bootstrap.json")
}
