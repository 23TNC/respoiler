# AGENTS.md

## Repo map (source-of-truth by area)
- `pixijs/`: PixiJS + TypeScript client (rendering, input, local staging UI, static content loaders).
- `spacetime/server/spacetimedb/`: SpacetimeDB module (runtime authority: souls, cards, tiles, attachments, staged entries, reducers).
- `pixijs/src/spacetime/bindings/`: generated TypeScript bindings for SpacetimeDB tables/reducers.

## Change philosophy
- Inspect before editing; make the **smallest correct change**.
- Preserve current structure and naming unless the task requires a migration.
- Do not rewrite unrelated systems to "clean up" while fixing a narrow issue.
- Client/server drift exists; resolve intentionally at boundaries instead of adding ad-hoc fallbacks in random files.

## Client vs server boundaries
- Server owns authoritative runtime state (table rows + reducer effects).
- Client owns rendering, interaction, drag/drop, local staged UI state, and runtime view-model derivation.
- Static JSON in `pixijs/src/data/**` is for definitions and validation metadata (cards/tiles/verbs/recipes), not authoritative runtime instance ownership/state.

## Schema, bindings, bootstrap rules
- When SpacetimeDB table/reducer types change, regenerate client bindings via `spacetime/server/generate-bindings.sh`; do not patch around stale generated files in app logic.
- Bootstrap/seed reducers should be idempotent where intended (`bootstrap_minimal_world` pattern).
- Avoid duplicating classification/normalization logic across many files; prefer shared helpers.

## Terminology glossary (current project usage)
- **soul**: character-like entity; may be player-owned or subordinate.
- **technique**: action card group (`techniques`).
- **essence**: aspect-like input card group (`essence`).
- **tile**: either world tile (`world_tile`) or soul-hosted event tile (`event_tile`).
- **recipe**: static ruleset for valid staged card combinations and effects metadata.
- **queue / running**: client currently tracks queued actions in UI state; runtime execution pipeline is not yet a full server-side job system.

## Current drift / watchouts
- There is a duplicated `pixijs/src/src/**` tree alongside `pixijs/src/**`; prefer editing `pixijs/src/**` unless explicitly migrating/removing duplicates.
- Some world tile names seeded by server do not map 1:1 to static tile IDs; client currently normalizes/falls back in runtime derivation.

- Canonical static definitions live in `pixijs/src/data/{cards,tiles,recipes}` and are mirrored into `spacetime/server/spacetimedb/static/{cards,tiles,recipes}`; keep those JSON files byte-for-byte aligned when changing definitions.
- Runtime tables should store numeric definition IDs for static cards/tiles/recipes; clients resolve display/classification metadata from local JSON maps by ID.
