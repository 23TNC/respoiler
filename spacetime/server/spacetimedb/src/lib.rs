use log::info;
use serde::Deserialize;
use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table};
use std::collections::HashMap;

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
    pub player_id: Option<u64>,
    pub owner_soul_id: Option<u64>,
    pub subordinate_type: Option<SubordinateType>,
}

#[spacetimedb::table(accessor = player, public)]
pub struct Player {
    #[primary_key]
    #[auto_inc]
    pub player_id: u64,
    #[unique]
    pub player_key: String,
}

#[spacetimedb::table(accessor = player_session)]
pub struct PlayerSession {
    #[primary_key]
    pub session_identity: Identity,
    pub player_id: u64,
    pub resolved_at_unix_ms: u64,
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

fn find_attachment_for_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: &TileHostType,
    host_id: u64,
) -> Option<TileTechniqueAttachment> {
    ctx.db
        .tile_technique_attachment()
        .iter()
        .find(|row| row.soul_id == soul_id && row.host_type == *host_type && row.host_id == host_id)
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
        .filter(|row| {
            row.soul_id == soul_id && row.host_type == host_type && row.host_id == host_id
        })
        .map(|row| row.attachment_id)
        .collect();

    for attachment_id in existing_ids {
        ctx.db
            .tile_technique_attachment()
            .attachment_id()
            .delete(&attachment_id);
    }
}

fn require_host(
    ctx: &ReducerContext,
    host_type: &TileHostType,
    host_id: u64,
) -> Result<(), String> {
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

fn host_definition_id(
    ctx: &ReducerContext,
    host_type: &TileHostType,
    host_id: u64,
) -> Result<u32, String> {
    match host_type {
        TileHostType::WorldTile => Ok(require_world_tile(ctx, host_id)?.definition_id),
        TileHostType::EventTile => Ok(require_event_tile(ctx, host_id)?.definition_id),
    }
}

fn is_sender_authorized_for_soul(ctx: &ReducerContext, actor_soul_id: u64) -> bool {
    let sender = ctx.sender();
    let authorized_player_id = ctx
        .db
        .player_session()
        .session_identity()
        .find(sender)
        .map(|session| session.player_id);

    let Some(authorized_player_id) = authorized_player_id else {
        return false;
    };

    let souls: Vec<Soul> = ctx.db.soul().iter().collect();
    let soul_by_id: HashMap<u64, &Soul> = souls.iter().map(|soul| (soul.soul_id, soul)).collect();

    let mut cursor = Some(actor_soul_id);
    while let Some(soul_id) = cursor {
        let Some(soul) = soul_by_id.get(&soul_id) else {
            return false;
        };
        if soul.player_id == Some(authorized_player_id) {
            return true;
        }
        cursor = soul.owner_soul_id;
    }

    false
}

fn current_unix_ms(ctx: &ReducerContext) -> u64 {
    let micros: i64 = ctx.timestamp.to_micros_since_unix_epoch();
    (micros / 1_000) as u64
}


fn parse_constant_count(expr: &Option<RecipeExpr>) -> Result<u32, String> {
    let Some(expr) = expr else {
        return Ok(1);
    };
    let Some(value) = &expr.value else {
        return Err(
            "Only constant numeric recipe input counts are currently supported".to_string(),
        );
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
    let files: Vec<RecipeFileDef> = serde_json::from_str(raw)
        .map_err(|error| format!("Failed parsing recipe JSON: {error}"))?;

    for file in files {
        if let Some(recipe) = file
            .recipes
            .into_iter()
            .find(|candidate| candidate.id == recipe_id)
        {
            return Ok((file.action_card_id, recipe));
        }
    }

    Err(format!("Unknown recipe id {}", recipe_id))
}

fn assert_card_unreserved(ctx: &ReducerContext, card_id: u64) -> Result<(), String> {
    if let Some(existing) = ctx
        .db
        .card_reservation()
        .iter()
        .find(|reservation| reservation.card_id == card_id)
    {
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

fn find_player_by_key(ctx: &ReducerContext, player_key: &str) -> Option<Player> {
    ctx.db
        .player()
        .iter()
        .find(|player| player.player_key == player_key)
}

fn ensure_player_session(ctx: &ReducerContext, player_id: u64) {
    let sender = ctx.sender();
    let _ = ctx.db.player_session().session_identity().delete(&sender);
    ctx.db.player_session().insert(PlayerSession {
        session_identity: sender,
        player_id,
        resolved_at_unix_ms: current_unix_ms(ctx),
    });
}

fn bootstrap_minimal_world_for_player(ctx: &ReducerContext, player_id: u64) {
    const PLAYER_SOUL_NAME: &str = "Bootstrap Soul";
    const SUBORDINATE_SOUL_NAME: &str = "Bootstrap Worker";

    let player_soul = if let Some(existing) = ctx
        .db
        .soul()
        .iter()
        .find(|soul| soul.player_id == Some(player_id) && soul.owner_soul_id.is_none())
    {
        existing
    } else {
        let fallback_name = find_soul_by_name(ctx, PLAYER_SOUL_NAME);
        let fallback_name_value = fallback_name.as_ref().map(|soul| soul.name.as_str());
        let new_name = if fallback_name.is_some() {
            format!("{} ({})", PLAYER_SOUL_NAME, player_id)
        } else {
            PLAYER_SOUL_NAME.to_string()
        };
        if fallback_name_value.is_some() {
            info!(
                "[bootstrap_minimal_world] creating player soul with unique fallback name '{}' for player {}",
                new_name, player_id
            );
        }
        let created = ctx.db.soul().insert(Soul {
            soul_id: 0,
            name: new_name,
            player_id: Some(player_id),
            owner_soul_id: None,
            subordinate_type: None,
        });
        info!(
            "[bootstrap_minimal_world] created player soul '{}' ({}) for player {}",
            created.name, created.soul_id, player_id
        );
        created
    };

    let subordinate_soul = if let Some(existing) = ctx.db.soul().iter().find(|soul| {
        soul.owner_soul_id == Some(player_soul.soul_id)
            && soul.subordinate_type == Some(SubordinateType::Control)
    }) {
        existing
    } else {
        let created = ctx.db.soul().insert(Soul {
            soul_id: 0,
            name: SUBORDINATE_SOUL_NAME.to_string(),
            player_id: None,
            owner_soul_id: Some(player_soul.soul_id),
            subordinate_type: Some(SubordinateType::Control),
        });
        info!(
            "[bootstrap_minimal_world] created subordinate soul '{}' ({}) owned by {}",
            created.name, created.soul_id, player_soul.soul_id
        );
        created
    };

    // Shared world content is still global for the test environment.
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

    let has_player_event_tile = ctx.db.event_tile().iter().any(|tile| {
        tile.soul_id == player_soul.soul_id && tile.definition_id == TILE_SCOUT_REFLECTION
    });
    if !has_player_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: player_soul.soul_id,
            definition_id: TILE_SCOUT_REFLECTION,
            display_order: 0,
        });
    }

    let has_subordinate_event_tile = ctx.db.event_tile().iter().any(|tile| {
        tile.soul_id == subordinate_soul.soul_id && tile.definition_id == TILE_DESPAIR_CHECK
    });
    if !has_subordinate_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: subordinate_soul.soul_id,
            definition_id: TILE_DESPAIR_CHECK,
            display_order: 0,
        });
    }
}

fn ensure_card_for_soul(
    ctx: &ReducerContext,
    soul_id: u64,
    definition_id: u32,
    linked_soul_id: Option<u64>,
) -> bool {
    let exists = ctx.db.card().iter().any(|card| {
        card.soul_id == soul_id
            && card.definition_id == definition_id
            && card.linked_soul_id == linked_soul_id
    });
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
pub fn resolve_test_player(ctx: &ReducerContext, player_key: String) -> Result<(), String> {
    let trimmed = player_key.trim();
    if trimmed.is_empty() {
        return Err("player_key must not be empty".to_string());
    }

    let player = if let Some(existing) = find_player_by_key(ctx, trimmed) {
        existing
    } else {
        let created = ctx.db.player().insert(Player {
            player_id: 0,
            player_key: trimmed.to_string(),
        });
        info!(
            "[resolve_test_player] created player {} for key '{}'",
            created.player_id, created.player_key
        );
        created
    };

    ensure_player_session(ctx, player.player_id);
    bootstrap_minimal_world_for_player(ctx, player.player_id);

    Ok(())
}

#[spacetimedb::reducer]
pub fn bootstrap_minimal_world(ctx: &ReducerContext) -> Result<(), String> {
    let sender = ctx.sender();
    let session = ctx
        .db
        .player_session()
        .session_identity()
        .find(sender)
        .ok_or_else(|| {
            "resolve_test_player must be called before bootstrap_minimal_world".to_string()
        })?;
    bootstrap_minimal_world_for_player(ctx, session.player_id);
    Ok(())
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
pub fn queue_recipe_on_host(
    ctx: &ReducerContext,
    actor_soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    recipe_id: u32,
    technique_card_id: u64,
    input_card_ids: Vec<u64>,
) -> Result<(), String> {
    info!(
        "[queue_recipe_on_host] entry actor_soul_id={} host_type={:?} host_id={} recipe_id={} technique_card_id={} input_card_ids={:?}",
        actor_soul_id, host_type, host_id, recipe_id, technique_card_id, input_card_ids
    );

    let _ = require_soul(ctx, actor_soul_id)?;
    if !is_sender_authorized_for_soul(ctx, actor_soul_id) {
        return Err(format!(
            "Sender is not authorized to queue recipes for soul {}",
            actor_soul_id
        ));
    }
    info!(
        "[queue_recipe_on_host] checkpoint after soul/auth validation actor_soul_id={}",
        actor_soul_id
    );

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
    info!(
        "[queue_recipe_on_host] checkpoint after host validation host_type={:?} host_id={}",
        host_type, host_id
    );

    let attachment = find_attachment_for_host(ctx, actor_soul_id, &host_type, host_id)
        .ok_or_else(|| "No technique attachment exists for this host".to_string())?;
    info!(
        "[queue_recipe_on_host] checkpoint after attachment lookup attachment_id={} attached_technique_card_id={}",
        attachment.attachment_id, attachment.technique_card_id
    );
    if attachment.technique_card_id != technique_card_id {
        return Err(format!(
            "Submitted technique card {} does not match attached technique {}",
            technique_card_id, attachment.technique_card_id
        ));
    }

    let technique_card = validate_technique_card(ctx, attachment.technique_card_id)?;
    if technique_card.soul_id != actor_soul_id {
        return Err(format!(
            "Technique card {} belongs to soul {}, not {}",
            technique_card_id, technique_card.soul_id, actor_soul_id
        ));
    }
    assert_card_unreserved(ctx, technique_card_id)?;
    info!(
        "[queue_recipe_on_host] checkpoint after technique validation technique_card_definition_id={}",
        technique_card.definition_id
    );

    let mut submitted_definition_counts = HashMap::<u32, u32>::new();
    let host_definition = host_definition_id(ctx, &host_type, host_id)?;
    submitted_definition_counts
        .entry(host_definition)
        .and_modify(|count| *count += 1)
        .or_insert(1);

    let mut unique_inputs = std::collections::HashSet::new();
    for card_id in &input_card_ids {
        if !unique_inputs.insert(*card_id) {
            return Err(format!(
                "Input card {} is duplicated in queue request",
                card_id
            ));
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
    info!(
        "[queue_recipe_on_host] checkpoint after input-card validation input_card_count={} submitted_definition_counts={:?}",
        unique_inputs.len(),
        submitted_definition_counts
    );

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
        required_definition_counts
            .entry(input.id)
            .and_modify(|existing| *existing += count)
            .or_insert(count);
    }
    info!(
        "[queue_recipe_on_host] checkpoint after recipe validation required_action_definition={} required_definition_counts={:?}",
        required_action_definition, required_definition_counts
    );

    if required_definition_counts != submitted_definition_counts {
        return Err(format!(
            "Submitted cards do not satisfy recipe {} requirements",
            recipe_id
        ));
    }

    let now = current_unix_ms();
    info!(
        "[queue_recipe_on_host] before recipe_queue insert actor_soul_id={} recipe_id={} host_type={:?} host_id={} now={}",
        actor_soul_id, recipe_id, host_type, host_id, now
    );
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
    info!(
        "[queue_recipe_on_host] after recipe_queue insert queue_id={}",
        queue_row.queue_id
    );

    for card_id in std::iter::once(technique_card_id).chain(input_card_ids.into_iter()) {
        info!(
            "[queue_recipe_on_host] before recipe_queue_card insert queue_id={} card_id={}",
            queue_row.queue_id, card_id
        );
        ctx.db.recipe_queue_card().insert(RecipeQueueCard {
            queue_card_id: 0,
            queue_id: queue_row.queue_id,
            card_id,
        });
        info!(
            "[queue_recipe_on_host] after recipe_queue_card insert queue_id={} card_id={}",
            queue_row.queue_id, card_id
        );

        assert_card_unreserved(ctx, card_id)?;
        info!(
            "[queue_recipe_on_host] before card_reservation insert queue_id={} card_id={}",
            queue_row.queue_id, card_id
        );
        ctx.db.card_reservation().insert(CardReservation {
            card_id,
            queue_id: queue_row.queue_id,
            reserved_at_unix_ms: now,
        });
        info!(
            "[queue_recipe_on_host] after card_reservation insert queue_id={} card_id={}",
            queue_row.queue_id, card_id
        );
    }

    Ok(())
}

#[spacetimedb::reducer]
pub fn debug_decode_queue_recipe_on_host(
    _ctx: &ReducerContext,
    actor_soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    recipe_id: u32,
    technique_card_id: u64,
    input_card_ids: Vec<u64>,
) -> Result<(), String> {
    info!(
        "[debug_decode_queue_recipe_on_host] decoded actor_soul_id={} host_type={:?} host_id={} recipe_id={} technique_card_id={} input_card_ids={:?}",
        actor_soul_id, host_type, host_id, recipe_id, technique_card_id, input_card_ids
    );
    Ok(())
}
