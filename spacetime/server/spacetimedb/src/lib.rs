use spacetimedb::{table, Identity, ReducerContext};

#[derive(Clone, Debug)]
pub enum SubordinateType {
    Control,
    Influence,
    Observe,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CardKind {
    Technique,
    Essence,
    Sundries,
    Reveries,
    Soul,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TileHostType {
    WorldTile,
    EventTile,
}

#[table(name = soul, public)]
pub struct Soul {
    #[primary_key]
    #[auto_inc]
    pub soul_id: u64,
    pub name: String,
    pub player_id: Option<Identity>,
    pub owner_soul_id: Option<u64>,
    pub subordinate_type: Option<SubordinateType>,
}

#[table(name = card, public)]
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

#[table(name = world_tile, public)]
pub struct WorldTile {
    #[primary_key]
    #[auto_inc]
    pub tile_id: u64,
    pub name: String,
    pub q: i32,
    pub r: i32,
}

#[table(name = event_tile, public)]
pub struct EventTile {
    #[primary_key]
    #[auto_inc]
    pub event_tile_id: u64,
    pub soul_id: u64,
    pub name: String,
    pub display_order: i32,
}

#[table(name = tile_technique_attachment, public)]
pub struct TileTechniqueAttachment {
    #[primary_key]
    #[auto_inc]
    pub attachment_id: u64,
    pub soul_id: u64,
    pub host_type: TileHostType,
    pub host_id: u64,
    pub technique_card_id: u64,
}

#[table(name = tile_stage_entry, public)]
pub struct TileStageEntry {
    #[primary_key]
    #[auto_inc]
    pub stage_entry_id: u64,
    pub soul_id: u64,
    pub host_type: TileHostType,
    pub host_id: u64,
    pub card_id: u64,
    pub order_index: i32,
}

fn require_card(ctx: &ReducerContext, card_id: u64) -> Card {
    ctx.db
        .card()
        .card_id()
        .find(card_id)
        .unwrap_or_else(|| panic!("Card {} not found", card_id))
}

fn require_world_tile(ctx: &ReducerContext, tile_id: u64) {
    if ctx.db.world_tile().tile_id().find(tile_id).is_none() {
        panic!("WorldTile {} not found", tile_id);
    }
}

fn require_event_tile(ctx: &ReducerContext, event_tile_id: u64) {
    if ctx.db.event_tile().event_tile_id().find(event_tile_id).is_none() {
        panic!("EventTile {} not found", event_tile_id);
    }
}

fn require_host_exists(ctx: &ReducerContext, host_type: &TileHostType, host_id: u64) {
    match host_type {
        TileHostType::WorldTile => require_world_tile(ctx, host_id),
        TileHostType::EventTile => require_event_tile(ctx, host_id),
    }
}

fn clear_attachment_for_host(ctx: &ReducerContext, soul_id: u64, host_type: &TileHostType, host_id: u64) {
    let to_delete: Vec<u64> = ctx
        .db
        .tile_technique_attachment()
        .iter()
        .filter(|attachment| {
            attachment.soul_id == soul_id
                && attachment.host_type == *host_type
                && attachment.host_id == host_id
        })
        .map(|attachment| attachment.attachment_id)
        .collect();

    for attachment_id in to_delete {
        ctx.db.tile_technique_attachment().attachment_id().delete(attachment_id);
    }
}

#[spacetimedb::reducer]
pub fn seed_test_data(ctx: &ReducerContext) {
    if ctx.db.soul().iter().next().is_some() {
        return;
    }

    let player_soul_id = ctx
        .db
        .soul()
        .insert(Soul {
            soul_id: 0,
            name: "Aria, Warden of Ash".to_string(),
            player_id: Some(ctx.sender),
            owner_soul_id: None,
            subordinate_type: None,
        })
        .soul_id;

    let follower_soul_id = ctx
        .db
        .soul()
        .insert(Soul {
            soul_id: 0,
            name: "Cinder Squire".to_string(),
            player_id: None,
            owner_soul_id: Some(player_soul_id),
            subordinate_type: Some(SubordinateType::Control),
        })
        .soul_id;

    for (name, kind, bg_color, linked_soul_id) in [
        ("Flame Sigil", CardKind::Technique, Some("#D94B2B"), None),
        ("Coalheart", CardKind::Essence, Some("#3C2A21"), None),
        ("Supply Satchel", CardKind::Sundries, Some("#5F4C3B"), None),
        ("Dream of Embers", CardKind::Reveries, Some("#7B2E2E"), None),
        ("Bond: Cinder Squire", CardKind::Soul, Some("#334455"), Some(follower_soul_id)),
    ] {
        ctx.db.card().insert(Card {
            card_id: 0,
            soul_id: player_soul_id,
            kind,
            name: name.to_string(),
            bg_color: bg_color.map(|c| c.to_string()),
            linked_soul_id,
        });
    }

    for (name, kind, bg_color) in [
        ("Guard Stance", CardKind::Technique, Some("#2A4D7A")),
        ("Ash Ration", CardKind::Essence, Some("#8A8A8A")),
        ("Scout Report", CardKind::Sundries, Some("#4A5A6A")),
    ] {
        ctx.db.card().insert(Card {
            card_id: 0,
            soul_id: follower_soul_id,
            kind,
            name: name.to_string(),
            bg_color: bg_color.map(|c| c.to_string()),
            linked_soul_id: None,
        });
    }

    for (name, q, r) in [
        ("Scorched Crossing", 0, 0),
        ("Dustway Approach", 1, 0),
        ("Broken Obelisk", 0, 1),
        ("Cinder Hollow", -1, 1),
    ] {
        ctx.db.world_tile().insert(WorldTile {
            tile_id: 0,
            name: name.to_string(),
            q,
            r,
        });
    }

    ctx.db.event_tile().insert(EventTile {
        event_tile_id: 0,
        soul_id: player_soul_id,
        name: "Aria - Tactical Board".to_string(),
        display_order: 0,
    });

    ctx.db.event_tile().insert(EventTile {
        event_tile_id: 0,
        soul_id: follower_soul_id,
        name: "Squire - Orders Queue".to_string(),
        display_order: 0,
    });
}

#[spacetimedb::reducer]
pub fn attach_technique_to_world_tile(
    ctx: &ReducerContext,
    soul_id: u64,
    technique_card_id: u64,
    tile_id: u64,
) {
    require_world_tile(ctx, tile_id);

    let card = require_card(ctx, technique_card_id);
    if card.kind != CardKind::Technique {
        panic!("Card {} is not a Technique", technique_card_id);
    }

    clear_attachment_for_host(ctx, soul_id, &TileHostType::WorldTile, tile_id);

    ctx.db
        .tile_technique_attachment()
        .insert(TileTechniqueAttachment {
            attachment_id: 0,
            soul_id,
            host_type: TileHostType::WorldTile,
            host_id: tile_id,
            technique_card_id,
        });
}

#[spacetimedb::reducer]
pub fn attach_technique_to_event_tile(
    ctx: &ReducerContext,
    soul_id: u64,
    technique_card_id: u64,
    event_tile_id: u64,
) {
    require_event_tile(ctx, event_tile_id);

    let card = require_card(ctx, technique_card_id);
    if card.kind != CardKind::Technique {
        panic!("Card {} is not a Technique", technique_card_id);
    }

    clear_attachment_for_host(ctx, soul_id, &TileHostType::EventTile, event_tile_id);

    ctx.db
        .tile_technique_attachment()
        .insert(TileTechniqueAttachment {
            attachment_id: 0,
            soul_id,
            host_type: TileHostType::EventTile,
            host_id: event_tile_id,
            technique_card_id,
        });
}

#[spacetimedb::reducer]
pub fn detach_technique_from_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
) {
    require_host_exists(ctx, &host_type, host_id);
    clear_attachment_for_host(ctx, soul_id, &host_type, host_id);
}

#[spacetimedb::reducer]
pub fn stage_card_on_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    card_id: u64,
) {
    require_host_exists(ctx, &host_type, host_id);
    let _card = require_card(ctx, card_id);

    let next_order_index = ctx
        .db
        .tile_stage_entry()
        .iter()
        .filter(|entry| {
            entry.soul_id == soul_id && entry.host_type == host_type && entry.host_id == host_id
        })
        .map(|entry| entry.order_index)
        .max()
        .unwrap_or(-1)
        + 1;

    ctx.db.tile_stage_entry().insert(TileStageEntry {
        stage_entry_id: 0,
        soul_id,
        host_type,
        host_id,
        card_id,
        order_index: next_order_index,
    });
}

#[spacetimedb::reducer]
pub fn unstage_card_from_host(
    ctx: &ReducerContext,
    soul_id: u64,
    host_type: TileHostType,
    host_id: u64,
    card_id: u64,
) {
    let target_stage_entry_id = ctx
        .db
        .tile_stage_entry()
        .iter()
        .find(|entry| {
            entry.soul_id == soul_id
                && entry.host_type == host_type
                && entry.host_id == host_id
                && entry.card_id == card_id
        })
        .map(|entry| entry.stage_entry_id);

    if let Some(stage_entry_id) = target_stage_entry_id {
        ctx.db.tile_stage_entry().stage_entry_id().delete(stage_entry_id);
    }
}
