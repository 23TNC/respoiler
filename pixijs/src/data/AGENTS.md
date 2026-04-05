# AGENTS.md

## Scope
Static content and loaders for tiles, cards, verbs, recipes, and character mock data.

## Purpose
- Provide canonical definition data for client classification/display logic.
- Fail fast on malformed JSON via strict loader validation.

## Rules
- Keep IDs stable and normalized; downstream systems rely on predictable IDs for matching/classification.
- Card `group` values in card JSON are the canonical client-side classification source.
- Recipe definitions should remain declarative; enforce invariants in loader/parser logic rather than scene code.
- Do not move runtime ownership/state fields into static JSON.

## Constraints
- Avoid duplicating normalization rules in each loader; reuse shared patterns when practical.
- Changes here should be coordinated with staging/classification logic in `src/game/**` if semantics change.

- Definition records must include stable numeric `id` plus descriptive `key`; runtime/network references should use numeric IDs while UI/debugging can use keys.
- When updating cards/tiles/recipes here, copy the same JSON into `spacetime/server/spacetimedb/static/**` in the same change.
