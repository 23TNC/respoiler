# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

Two sub-projects:

- **`pixijs/`** — TypeScript/PixiJS frontend client (Vite, no framework)
- **`spacetime/`** — SpacetimeDB backend (Rust WASM module) + Docker compose for local server

## Commands

### Frontend (`pixijs/`)

```bash
cd pixijs
npm run dev       # dev server at localhost:5173
npm run build     # production build
npm run preview   # preview production build
```

No test runner is configured.

### Backend (`spacetime/server/spacetimedb/`)

```bash
# Start local SpacetimeDB via Docker
cd spacetime
docker compose run --rm start

# Build the Rust WASM module
docker compose run --rm build

# Publish module to local server
spacetime publish respoiler --clear-database -y --module-path spacetime/server/spacetimedb

# Generate TypeScript bindings (run from spacetime/server/)
bash generate-bindings.sh
# Output lands in pixijs/src/spacetime/bindings/ — DO NOT edit those files manually

# View server logs
spacetime logs respoiler
```

The `spacetime.json` config targets `server: "local"`, `database: "respoiler"`.

## Architecture

### Coordinate / Packing System

Cards have a compact two-level spatial encoding shared between Rust and TypeScript — understanding this is required to work with card data:

- **World coordinates** `(q, r)` — flat axial hex grid, unbounded
- **Zone** `(zone_q, zone_r)` — 8×8 chunk a card belongs to (`zone = floor(world / 8)`)
- **Local position** `(local_q, local_r)` — offset within zone (0–7)
- **Packed zone** — `u32`: `[zone_q: i12][zone_r: i12][z: u8]`
- **Packed position** — `u8`: `[q: 3 bits][r: 3 bits][reserved: 2]`
- **Packed definition** — `u16`: `[card_type: 4 bits][definition_id: 12 bits]`

Rust packing logic lives in `spacetime/server/spacetimedb/src/packing.rs`; TypeScript unpacking mirrors it in `pixijs/src/spacetime/data.ts` (`unpackZone`, `unpackPosition`, `decodeCardType`).

### Server → Client Data Flow

```
SpacetimeDB (Rust WASM) → auto-generated bindings (pixijs/src/spacetime/bindings/)
    → server_cards / server_zones global records (data.ts)
    → syncClientCardsFromServer() → client_cards (decoded, enriched)
    → GameView.render() → panel.refresh() → PixiJS Graphics
```

`ClientCard` extends `ServerCard` with decoded fields (`card_type`, `definition_id`, `world_q`, `world_r`, etc.) and UI state flags (`selected`, `dragging`, `hidden`, `stale`, `dirty`).

### Rendering Pipeline

`main.ts` creates a PixiJS `Application`, calls `bootstrap()` (debug data), instantiates `GameView`, and calls `gameView.render()`.

`GameView` (`ui/game_view.ts`):
1. Calls `computePanelLayout()` to get proportional rects for all panels
2. Syncs panel instances (creates/destroys `Panel` subclasses)
3. Calls `panel.setLayout()` then `panel.refresh()` on each panel

Each **Panel subclass** owns its own card rendering — it reads from `client_cards`, computes layout, and creates PixiJS display objects in `refresh()`:
- `InventoryPanel` — 5-column rect grid for card types 1–5 (Disciplines, Faculties, Requisites, Reveries, Souls)
- `WorldBoardPanel` — hex tiles for card type 6, using axial→pixel conversion from `hexagon/grid.ts`
- `DetailsPanel`, `EventPanel`, `SlotPanel` — currently empty placeholders

Card view factories: `createRectangleCardView()` and `createHexCardView()` return PixiJS Containers. All sizing is proportional to screen dimensions.

### SpacetimeDB Integration Notes

- `spacetime/server/AGENTS.md` contains authoritative SpacetimeDB Rust SDK rules — consult it before writing or modifying server-side Rust.
- Generated bindings at `pixijs/src/spacetime/bindings/` are auto-generated — never edit them; run `generate-bindings.sh` to regenerate after schema changes.
- Feature checklist when spanning backend + client: define table → define reducer → subscribe on client → call reducer from client → render from table.
