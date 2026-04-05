# AGENTS.md

## Scope
Rust SpacetimeDB module (`src/lib.rs`) with table schema and reducers.

## Architecture boundaries
- This module is the authority for runtime entities: souls, cards, world/event tiles, tile attachments, stage entries.
- Reducers enforce ownership and validity checks (card ownership, host existence, card kind constraints).
- Client should observe rows + call reducers; server should not assume client-side prevalidation.

## Schema/reducer guidance
- Keep naming aligned with generated TypeScript bindings (`soul_id` -> `soulId`, etc.).
- For bootstrap data, keep inserts idempotent when reducer is intended to be rerunnable.
- Prefer helper functions for repeated validation/search behavior (`require_*`, `ensure_*`).

## Terminology alignment
- `CardKind::Technique` aligns with client card group `techniques`.
- `CardKind::Essence` aligns with `essence`.
- `CardKind::Sundries` aligns with `sundries`.
- `CardKind::Reveries` aligns with `reveries`.
- `CardKind::Soul` aligns with `souls`.

## Current drift / watchouts
- Seed/bootstrap card/tile names are not guaranteed to match static client definition IDs; avoid assuming display name equality is a stable cross-layer key.

## Static definition sync
- Keep `static/cards/base.cards.json`, `static/tiles/base.tiles.json`, and `static/recipes/base.recipes.json` synchronized with `pixijs/src/data/**` in the same commit.
- Table rows should prefer numeric `*_definition_id` style fields for static references; avoid transmitting duplicated static metadata (group/kind/description) in runtime rows.
