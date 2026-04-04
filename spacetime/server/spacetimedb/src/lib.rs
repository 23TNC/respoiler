use spacetimedb::{Identity, ReducerContext, SpacetimeType, Table};

#[derive(Debug, Clone, PartialEq, Eq, SpacetimeType)]
pub enum SubordinateType {
    Control,
    Influence,
    Observe,
}

#[derive(Debug, Clone, PartialEq, Eq, SpacetimeType)]
pub enum CardKind {
    Technique,
    Essence,
    Sundries,
    Reveries,
    Soul,
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
    pub kind: CardKind,
    pub name: String,
    pub bg_color: Option<String>,
    pub linked_soul_id: Option<u64>,
}

#[spacetimedb::table(accessor = world_tile, public)]
pub struct WorldTile {
    #[primary_key]
    #[auto_inc]
    pub tile_id: u64,
    pub name: String,
    pub q: i32,
    pub r: i32,
}

#[spacetimedb::table(accessor = event_tile, public)]
pub struct EventTile {
    #[primary_key]
    #[auto_inc]
    pub event_tile_id: u64,
    pub soul_id: u64,
    pub name: String,
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

    if card.kind != CardKind::Technique {
        return Err(format!(
            "Card {} is not Technique (found {:?})",
            technique_card_id, card.kind
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

#[spacetimedb::reducer]
pub fn seed_test_data(ctx: &ReducerContext) {
    let player_identity = ctx.sender();

    let player_soul = ctx.db.soul().insert(Soul {
        soul_id: 0,
        name: "Ariadne Prime".to_string(),
        player_id: Some(player_identity),
        owner_soul_id: None,
        subordinate_type: None,
    });

    let follower_soul = ctx.db.soul().insert(Soul {
        soul_id: 0,
        name: "Glassbound Echo".to_string(),
        player_id: None,
        owner_soul_id: Some(player_soul.soul_id),
        subordinate_type: Some(SubordinateType::Control),
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: player_soul.soul_id,
        kind: CardKind::Technique,
        name: "Lattice Pin".to_string(),
        bg_color: Some("#2E6F95".to_string()),
        linked_soul_id: None,
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: player_soul.soul_id,
        kind: CardKind::Essence,
        name: "Distilled Dawn".to_string(),
        bg_color: Some("#F4D35E".to_string()),
        linked_soul_id: None,
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: player_soul.soul_id,
        kind: CardKind::Sundries,
        name: "Traveler's Charter".to_string(),
        bg_color: Some("#6D597A".to_string()),
        linked_soul_id: None,
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: player_soul.soul_id,
        kind: CardKind::Soul,
        name: "Bond: Glassbound Echo".to_string(),
        bg_color: Some("#457B9D".to_string()),
        linked_soul_id: Some(follower_soul.soul_id),
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: follower_soul.soul_id,
        kind: CardKind::Technique,
        name: "Needle Rain".to_string(),
        bg_color: Some("#264653".to_string()),
        linked_soul_id: None,
    });

    let _ = ctx.db.card().insert(Card {
        card_id: 0,
        soul_id: follower_soul.soul_id,
        kind: CardKind::Reveries,
        name: "Borrowed Horizon".to_string(),
        bg_color: Some("#8AB17D".to_string()),
        linked_soul_id: None,
    });

    let _ = ctx.db.world_tile().insert(WorldTile {
        tile_id: 0,
        name: "Sunken Gate".to_string(),
        q: 0,
        r: 0,
    });

    let _ = ctx.db.world_tile().insert(WorldTile {
        tile_id: 0,
        name: "Ash Meridian".to_string(),
        q: 1,
        r: 0,
    });

    let _ = ctx.db.world_tile().insert(WorldTile {
        tile_id: 0,
        name: "Rime Verge".to_string(),
        q: 0,
        r: 1,
    });

    let _ = ctx.db.event_tile().insert(EventTile {
        event_tile_id: 0,
        soul_id: player_soul.soul_id,
        name: "Ariadne's Watch".to_string(),
        display_order: 0,
    });

    let _ = ctx.db.event_tile().insert(EventTile {
        event_tile_id: 0,
        soul_id: follower_soul.soul_id,
        name: "Echo's Perch".to_string(),
        display_order: 0,
    });
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
        .filter(|row| {
            row.soul_id == soul_id && row.host_type == host_type && row.host_id == host_id
        })
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
