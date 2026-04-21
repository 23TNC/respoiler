# ARCHITECTURE

## Top-level layout
- `pixijs/`: frontend app (PixiJS rendering, input handling, card definitions, generated bindings).
- `spacetime/`: SpaceTimeDB local runtime config + backend module source.
- `CLAUDE.md`: existing high-level contributor/agent notes.

## Client code
- Entry point: `pixijs/src/main.ts` initializes Pixi `Application`, loads debug data, creates `GameView`, and triggers render.
- UI/rendering: `pixijs/src/ui/` (panel system, hex/rectangle card renderers, input manager/resolver).
- Client-side game/spatial data: `pixijs/src/spacetime/data.ts` (server/client card maps, packing helpers, selection state).
- Definitions/static card metadata:
  - JSON card files under `pixijs/src/cards/*.json`
  - recipes under `pixijs/public/recipes/recipes.json`

## Backend / SpaceTimeDB code
- Rust module: `spacetime/server/spacetimedb/src/` (`cards.rs`, `players.rs`, `actions.rs`, `zones.rs`, `bootstrap.rs`, `packing.rs`, `lib.rs`).
- Module manifest/config: `spacetime/server/spacetimedb/Cargo.toml`, `spacetime/server/spacetime.json`, `spacetime/server/spacetime.local.json`.
- Static bootstrap data: `spacetime/server/spacetimedb/static/` (cards + recipes JSON) and `bootstrap/bootstrap.json`.

## Data flow (inferred from code)
1. SpaceTimeDB module defines tables/reducers in Rust.
2. `generate-bindings.sh` generates TS bindings into `pixijs/src/spacetime/bindings/`.
3. Client updates in-memory `server_*` + `client_*` records (`data.ts`).
4. `GameView` and panel classes read client state and render Pixi display objects.

## Generated code/bindings
- `pixijs/src/spacetime/bindings/` appears generated from SpaceTimeDB schema.
- Regenerate via `spacetime/server/generate-bindings.sh` instead of manual edits.

## Unclear/implicit areas
- Runtime subscription wiring is not fully visible in the inspected files; treat generated binding usage points as the source of truth before refactors.
