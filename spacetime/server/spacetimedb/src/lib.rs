use log::info;
use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table};

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
    pub label: String,
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
        .any(|tile| tile.soul_id == player_soul.soul_id && tile.label == "Bootstrap Watch");
    if !has_player_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: player_soul.soul_id,
            definition_id: TILE_SCOUT_REFLECTION,
            label: "Bootstrap Watch".to_string(),
            display_order: 0,
        });
    }

    let has_subordinate_event_tile = ctx
        .db
        .event_tile()
        .iter()
        .any(|tile| tile.soul_id == subordinate_soul.soul_id && tile.label == "Worker Post");
    if !has_subordinate_event_tile {
        let _ = ctx.db.event_tile().insert(EventTile {
            event_tile_id: 0,
            soul_id: subordinate_soul.soul_id,
            definition_id: TILE_DESPAIR_CHECK,
            label: "Worker Post".to_string(),
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
