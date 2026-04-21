# CONVENTIONS

## Observable code style
- TypeScript uses ES modules, double quotes, semicolons, explicit return types on exported functions/classes in many files.
- Strict typing is expected (`strict: true` in tsconfig).
- Small utility functions are favored for packing/unpacking and state updates.

## File and module organization
- UI code grouped by feature folders (`ui/panels`, `ui/hexagon`, `ui/rectangle`, `ui/input`).
- SpaceTimeDB client state utilities live under `src/spacetime/`.
- Static card definitions are JSON-first, then loaded/normalized in TS helpers.

## Data and definitions
- Prefer JSON/static assets for card/recipe data instead of hardcoded literals in UI logic.
- Keep packing/encoding logic centralized (`spacetime/server/spacetimedb/src/packing.rs`, `pixijs/src/spacetime/data.ts`).

## Architectural idioms worth preserving
- Panel-based rendering with `Panel` subclasses handling their own `refresh()` behavior.
- `GameView` orchestrates layout, dirty-marking, and render sequencing.
- Generated bindings directory should be treated as generated output, not hand-maintained source.
