use log::info;
use serde::Deserialize;
use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const CARD_WORK: u32 = 1;
const CARD_STUDY: u32 = 2;
const CARD_HEALTH: u32 = 8;
const CARD_FOLLOWER: u32 = 19;

const TILE_FOREST: u32 = 3;
const TILE_DESPAIR_CHECK: u32 = 6;
const TILE_SCOUT_REFLECTION: u32 = 7;

#[derive(Debug, Clone, PartialEq, Eq, SpacetimeType)]
pub enum SubordinateType {
    Control,
    Influence,
    Observe,
}

#[derive(Debug, Clone, PartialEq, Eq, SpacetimeType)]
pub enum TileHostType {
    WorldTile,
    EventTile,
}

#[spacetimedb::table(accessor = soul, public)]
pub struct Soul {
    #[primary_key]
    #[auto_inc]
    pub soul_id: u64,
    pub name: String,
    pub player_id: Option<Identity>,
    pub owner_soul_id: Option<u64>,
    pub subordinate_type: Option<SubordinateType>,
}

#[spacetimedb::table(accessor = card, public)]
pub struct Card {
    #[primary_key]
    #[auto_inc]
    pub card_id: u64,
    pub soul_id: u64,
    pub definition_id: u32,
    pub linked_soul_id: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, SpacetimeType)]
pub enum RecipeQueueState {
    Queued,
    Canceled,
}

#[spacetimedb::table(accessor = world_tile, public)]
pub struct WorldTile {
    #[primary_key]
    #[auto_inc]
    pub tile_id: u64,
    pub definition_id: u32,
    pub q: i32,
    pub r: i32,
}

#[spacetimedb::table(accessor = event_tile, public)]
pub struct EventTile {
    #[primary_key]
    #[auto_inc]
    pub event_tile_id: u64,
    pub soul_id: u64,
    pub definition_id: u32,
    pub display_order: u32,
}

#[spacetimedb::table(accessor = tile_technique_attachment, public)]
pub struct TileTechniqueAttachment {
    #[primary_key]
    #[auto_inc]
    pub attachment_id: u64,
    pub soul_id: u64,
    pub host_type: TileHostType,
    pub host_id: u64,
    pub technique_card_id: u64,
}

#[spacetimedb::table(accessor = tile_stage_entry, public)]
pub struct TileStageEntry {
    #[primary_key]
    #[auto_inc]
    pub stage_entry_id: u64,
    pub soul_id: u64,
    pub host_type: TileHostType,
    pub host_id: u64,
    pub card_id: u64,
    pub order_index: u32,
}

#[spacetimedb::table(accessor = recipe_queue, public)]
pub struct RecipeQueue {
    #[primary_key]
    #[auto_inc]
    pub queue_id: u64,
    pub recipe_id: u32,
    pub actor_soul_id: u64,
    pub host_type: TileHostType,
    pub host_id: u64,
    pub queued_at_unix_ms: u64,
    pub started_at_unix_ms: Option<u64>,
    pub state: RecipeQueueState,
}

#[spacetimedb::table(accessor = recipe_queue_card, public)]
pub struct RecipeQueueCard {
    #[primary_key]
    #[auto_inc]
    pub queue_card_id: u64,
    pub queue_id: u64,
    pub card_id: u64,
}

#[spacetimedb::table(accessor = card_reservation, public)]
pub struct CardReservation {
    #[primary_key]
    pub card_id: u64,
    pub queue_id: u64,
    pub reserved_at_unix_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecipeFileDef {
    action_card_id: u32,
    recipes: Vec<RecipeDef>,
}

#[derive(Debug, Deserialize)]
struct RecipeDef {
    id: u32,
    input: Vec<RecipeInputBinding>,
}

#[derive(Debug, Deserialize)]
struct RecipeInputBinding {
    id: u32,
    count: Option<RecipeExpr>,
}

#[derive(Debug, Deserialize)]
struct RecipeExpr {
    value: Option<serde_json::Value>,
}

fn is_technique_definition(definition_id: u32) -> bool {
    matches!(definition_id, CARD_WORK | CARD_STUDY)
}

fn require_card(ctx: &ReducerContext, card_id: u64) -> Result<Card, String> {
    ctx.db
        .card()
        .card_id()
        .find(card_id)
        .ok_or_else(|| format!("Card {} not found", card_id))
}

fn require_soul(ctx: &ReducerContext, soul_id: u64) -> Result<Soul, String> {
    ctx.db
        .soul()
        .soul_id()
        .find(soul_id)
        .ok_or_else(|| format!("Soul {} not found", soul_id))
}

fn require_world_tile(ctx: &ReducerContext, tile_id: u64) -> Result<WorldTile, String> {
    ctx.db
        .world_tile()
        .tile_id()
        .find(tile_id)
        .ok_or_else(|| format!("World tile {} not found", tile_id))
}

fn require_event_tile(ctx: &ReducerContext, event_tile_id: u64) -> Result<EventTile, String> {
    ctx.db
        .event_tile()
        .event_tile_id()
        .find(event_tile_id)
        .ok_or_else(|| format!("Event tile {} not found", event_tile_id))
}

fn validate_technique_card(ctx: &ReducerContext, technique_card_id: u64) -> Result<Card, String> {
    let card = require_card(ctx, technique_card_id)?;

    if !is_technique_definition(card.definition_id) {
        return Err(format!(
            "Card {} is not a technique definition (found id {})",
            technique_card_id, card.definition_id
        ));
    }

    Ok(card)
}

fn replace_attachment_for_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    technique_card_id: u64,
) {
    delete_attachment_for_host(ctx, soul_id, host_type.clone(), host_id);

    ctx.db
        .tile_technique_attachment()
        .insert(TileTechniqueAttachment {
            attachment_id: 0,
            soul_id,
            host_type,
            host_id,
            technique_card_id,
        });
}

fn delete_attachment_for_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
) {
    let existing_ids: Vec<u64> = ctx
        .db
        .tile_technique_attachment()
        .iter()
        .filter(|row| row.soul_id == soul_id && row.host_type == host_type && row.host_id == host_id)
        .map(|row| row.attachment_id)
        .collect();

    for attachment_id in existing_ids {
        ctx.db
            .tile_technique_attachment()
            .attachment_id()
            .delete(&attachment_id);
    }
}

fn require_host(ctx: &ReducerContext, host_type: &TileHostType, host_id: u64) -> Result<(), String> {
    match host_type {
        TileHostType::WorldTile => {
            let _ = require_world_tile(ctx, host_id)?;
        }
        TileHostType::EventTile => {
            let _ = require_event_tile(ctx, host_id)?;
        }
    }
    Ok(())
}

fn host_definition_id(ctx: &ReducerContext, host_type: &TileHostType, host_id: u64) -> Result<u32, String> {
    match host_type {
        TileHostType::WorldTile => Ok(require_world_tile(ctx, host_id)?.definition_id),
        TileHostType::EventTile => Ok(require_event_tile(ctx, host_id)?.definition_id),
    }
}

fn is_sender_authorized_for_soul(ctx: &ReducerContext, actor_soul_id: u64) -> bool {
    let sender = ctx.sender();
    let souls: Vec<Soul> = ctx.db.soul().iter().collect();
    let soul_by_id: HashMap<u64, &Soul> = souls.iter().map(|soul| (soul.soul_id, soul)).collect();

    let mut cursor = Some(actor_soul_id);
    while let Some(soul_id) = cursor {
        let Some(soul) = soul_by_id.get(&soul_id) else {
            return false;
        };
        if soul.player_id.as_ref() == Some(&sender) {
            return true;
        }
        cursor = soul.owner_soul_id;
    }

    false
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn parse_constant_count(expr: &Option<RecipeExpr>) -> Result<u32, String> {
    let Some(expr) = expr else {
        return Ok(1);
    };
    let Some(value) = &expr.value else {
        return Err("Only constant numeric recipe input counts are currently supported".to_string());
    };
    let Some(count) = value.as_u64() else {
        return Err("Recipe input count must be an unsigned integer".to_string());
    };
    if count == 0 {
        return Err("Recipe input count must be >= 1".to_string());
    }
    Ok(count as u32)
}

fn find_recipe(recipe_id: u32) -> Result<(u32, RecipeDef), String> {
    let raw = include_str!("../static/recipes/base.recipes.json");
    let files: Vec<RecipeFileDef> =
        serde_json::from_str(raw).map_err(|error| format!("Failed parsing recipe JSON: {error}"))?;

    for file in files {
        if let Some(recipe) = file.recipes.into_iter().find(|candidate| candidate.id == recipe_id) {
            return Ok((file.action_card_id, recipe));
        }
    }

    Err(format!("Unknown recipe id {}", recipe_id))
}

fn assert_card_unreserved(ctx: &ReducerContext, card_id: u64) -> Result<(), String> {
    if let Some(existing) = ctx.db.card_reservation().card_id().find(card_id) {
        return Err(format!(
            "Card {} is already reserved by queue {}",
            card_id, existing.queue_id
        ));
    }
    Ok(())
}

fn find_soul_by_name(ctx: &ReducerContext, name: &str) -> Option<Soul> {
    ctx.db.soul().iter().find(|soul| soul.name == name)
}

fn ensure_card_for_soul(
    ctx: &ReducerContext,
    soul_id: u64,
    definition_id: u32,
    linked_soul_id: Option<u64>,
) -> bool {
    let exists = ctx
        .db
        .card()
        .iter()
        .any(|card| card.soul_id == soul_id && card.definition_id == definition_id && card.linked_soul_id == linked_soul_id);
    if exists {
        return false;
    }

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id,
        definition_id,
        linked_soul_id,
    });

    true
}

#[spacetimedb::reducer]
pub fn bootstrap_minimal_world(ctx: &ReducerContext) {
    const PLAYER_SOUL_NAME: &str = "Bootstrap Soul";
    const SUBORDINATE_SOUL_NAME: &str = "Bootstrap Worker";

    let (player_soul, player_was_created) =
        if let Some(existing) = find_soul_by_name(ctx, PLAYER_SOUL_NAME) {
            (existing, false)
        } else {
            (
                ctx.db.soul().insert(Soul {
                    soul_id: 0,
                    name: PLAYER_SOUL_NAME.to_string(),
                    player_id: Some(ctx.sender()),
                    owner_soul_id: None,
                    subordinate_type: None,
                }),
                true,
            )
        };
    if player_was_created {
        info!(
            "[bootstrap_minimal_world] created player soul '{}' ({})",
            PLAYER_SOUL_NAME, player_soul.soul_id
        );
    }

    let (subordinate_soul, subordinate_was_created) =
        if let Some(existing) = find_soul_by_name(ctx, SUBORDINATE_SOUL_NAME) {
            (existing, false)
        } else {
            (
                ctx.db.soul().insert(Soul {
                    soul_id: 0,
                    name: SUBORDINATE_SOUL_NAME.to_string(),
                    player_id: None,
                    owner_soul_id: Some(player_soul.soul_id),
                    subordinate_type: Some(SubordinateType::Control),
                }),
                true,
            )
        };
    if subordinate_was_created {
        info!(
            "[bootstrap_minimal_world] created subordinate soul '{}' ({})",
            SUBORDINATE_SOUL_NAME, subordinate_soul.soul_id
        );
    }

    let has_forest_origin = ctx
        .db
        .world_tile()
        .iter()
        .any(|tile| tile.q == 0 && tile.r == 0 && tile.definition_id == TILE_FOREST);
    if !has_forest_origin {
        let _ = ctx.db.world_tile().insert(WorldTile {
            tile_id: 0,
            definition_id: TILE_FOREST,
            q: 0,
            r: 0,
        });
    }

    for (definition_id, linked_soul_id) in [
        (CARD_WORK, None),
        (CARD_STUDY, None),
        (CARD_HEALTH, None),
        (CARD_FOLLOWER, Some(subordinate_soul.soul_id)),
    ] {
        let _ = ensure_card_for_soul(ctx, player_soul.soul_id, definition_id, linked_soul_id);
    }

    for definition_id in [CARD_WORK, CARD_HEALTH] {
        let _ = ensure_card_for_soul(ctx, subordinate_soul.soul_id, definition_id, None);
    }

    let has_player_event_tile = ctx
        .db
        .event_tile()
        .iter()
        .any(|tile| tile.soul_id == player_soul.soul_id && tile.definition_id == TILE_SCOUT_REFLECTION);
    if !has_player_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: player_soul.soul_id,
            definition_id: TILE_SCOUT_REFLECTION,
            display_order: 0,
        });
    }

    let has_subordinate_event_tile = ctx
        .db
        .event_tile()
        .iter()
        .any(|tile| tile.soul_id == subordinate_soul.soul_id && tile.definition_id == TILE_DESPAIR_CHECK);
    if !has_subordinate_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: subordinate_soul.soul_id,
            definition_id: TILE_DESPAIR_CHECK,
            display_order: 0,
        });
    }
}

#[spacetimedb::reducer]
pub fn attach_technique_to_world_tile(
    ctx: &ReducerContext,
    soul_id: u64,
    technique_card_id: u64,
    tile_id: u64,
) -> Result<(), String> {
    let card = validate_technique_card(ctx, technique_card_id)?;
    if card.soul_id != soul_id {
        return Err(format!(
            "Technique card {} belongs to soul {}, not {}",
            technique_card_id, card.soul_id, soul_id
        ));
    }

    let _ = require_world_tile(ctx, tile_id)?;

    replace_attachment_for_host(
        ctx,
        soul_id,
        TileHostType::WorldTile,
        tile_id,
        technique_card_id,
    );
    Ok(())
}

#[spacetimedb::reducer]
pub fn attach_technique_to_event_tile(
    ctx: &ReducerContext,
    soul_id: u64,
    technique_card_id: u64,
    event_tile_id: u64,
) -> Result<(), String> {
    let card = validate_technique_card(ctx, technique_card_id)?;
    if card.soul_id != soul_id {
        return Err(format!(
            "Technique card {} belongs to soul {}, not {}",
            technique_card_id, card.soul_id, soul_id
        ));
    }

    let _ = require_event_tile(ctx, event_tile_id)?;

    replace_attachment_for_host(
        ctx,
        soul_id,
        TileHostType::EventTile,
        event_tile_id,
        technique_card_id,
    );
    Ok(())
}

#[spacetimedb::reducer]
pub fn detach_technique_from_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
) {
    delete_attachment_for_host(ctx, soul_id, host_type, host_id);
}

#[spacetimedb::reducer]
pub fn stage_card_on_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    card_id: u64,
) -> Result<(), String> {
    let card = require_card(ctx, card_id)?;

    if card.soul_id != soul_id {
        return Err(format!(
            "Card {} belongs to soul {}, not {}",
            card_id, card.soul_id, soul_id
        ));
    }

    require_host(ctx, &host_type, host_id)?;

    let next_order = ctx
        .db
        .tile_stage_entry()
        .iter()
        .filter(|row| row.soul_id == soul_id && row.host_type == host_type && row.host_id == host_id)
        .map(|row| row.order_index)
        .max()
        .map(|max| max + 1)
        .unwrap_or(0);

    ctx.db.tile_stage_entry().insert(TileStageEntry {
        stage_entry_id: 0,
        soul_id,
        host_type,
        host_id,
        card_id,
        order_index: next_order,
    });

    Ok(())
}

#[spacetimedb::reducer]
pub fn unstage_card_from_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    card_id: u64,
) {
    let stage_entry_ids: Vec<u64> = ctx
        .db
        .tile_stage_entry()
        .iter()
        .filter(|row| {
            row.soul_id == soul_id
                && row.host_type == host_type
                && row.host_id == host_id
                && row.card_id == card_id
        })
        .map(|row| row.stage_entry_id)
        .collect();

    for stage_entry_id in stage_entry_ids {
        ctx.db
            .tile_stage_entry()
            .stage_entry_id()
            .delete(&stage_entry_id);
    }
}

#[spacetimedb::reducer]
pub fn queue_recipe_on_host(
    ctx: &ReducerContext,
    actor_soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    recipe_id: u32,
    technique_card_id: u64,
    input_card_ids: Vec<u64>,
) -> Result<(), String> {
    let _ = require_soul(ctx, actor_soul_id)?;
    if !is_sender_authorized_for_soul(ctx, actor_soul_id) {
        return Err(format!(
            "Sender is not authorized to queue recipes for soul {}",
            actor_soul_id
        ));
    }

    require_host(ctx, &host_type, host_id)?;
    if host_type == TileHostType::EventTile {
        let event_tile = require_event_tile(ctx, host_id)?;
        if event_tile.soul_id != actor_soul_id {
            return Err(format!(
                "Event tile {} belongs to soul {}, not {}",
                host_id, event_tile.soul_id, actor_soul_id
            ));
        }
    }

    let technique_card = validate_technique_card(ctx, technique_card_id)?;
    if technique_card.soul_id != actor_soul_id {
        return Err(format!(
            "Technique card {} belongs to soul {}, not {}",
            technique_card_id, technique_card.soul_id, actor_soul_id
        ));
    }
    assert_card_unreserved(ctx, technique_card_id)?;

    let mut submitted_definition_counts = HashMap::<u32, u32>::new();
    let host_definition = host_definition_id(ctx, &host_type, host_id)?;
    submitted_definition_counts
        .entry(host_definition)
        .and_modify(|count| *count += 1)
        .or_insert(1);

    let mut unique_inputs = std::collections::HashSet::new();
    for card_id in &input_card_ids {
        if !unique_inputs.insert(*card_id) {
            return Err(format!("Input card {} is duplicated in queue request", card_id));
        }
        if *card_id == technique_card_id {
            return Err("Technique card cannot be included in input_card_ids".to_string());
        }
        let card = require_card(ctx, *card_id)?;
        if card.soul_id != actor_soul_id {
            return Err(format!(
                "Input card {} belongs to soul {}, not {}",
                card.card_id, card.soul_id, actor_soul_id
            ));
        }
        assert_card_unreserved(ctx, *card_id)?;
        submitted_definition_counts
            .entry(card.definition_id)
            .and_modify(|count| *count += 1)
            .or_insert(1);
    }

    let (required_action_definition, recipe) = find_recipe(recipe_id)?;
    if required_action_definition != technique_card.definition_id {
        return Err(format!(
            "Recipe {} expects action card definition {}, got {}",
            recipe_id, required_action_definition, technique_card.definition_id
        ));
    }

    let mut required_definition_counts = HashMap::<u32, u32>::new();
    for input in &recipe.input {
        let count = parse_constant_count(&input.count)?;
        required_definition_counts.insert(input.id, count);
    }

    if required_definition_counts != submitted_definition_counts {
        return Err(format!(
            "Submitted cards do not satisfy recipe {} requirements",
            recipe_id
        ));
    }

    let now = current_unix_ms();
    let queue_row = ctx.db.recipe_queue().insert(RecipeQueue {
        queue_id: 0,
        recipe_id,
        actor_soul_id,
        host_type: host_type.clone(),
        host_id,
        queued_at_unix_ms: now,
        started_at_unix_ms: None,
        state: RecipeQueueState::Queued,
    });

    for card_id in std::iter::once(technique_card_id).chain(input_card_ids.into_iter()) {
        ctx.db.recipe_queue_card().insert(RecipeQueueCard {
            queue_card_id: 0,
            queue_id: queue_row.queue_id,
            card_id,
        });

        ctx.db.card_reservation().insert(CardReservation {
            card_id,
            queue_id: queue_row.queue_id,
            reserved_at_unix_ms: now,
        });
    }

    Ok(())
}
