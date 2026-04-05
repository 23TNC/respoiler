# AGENTS.md

## Scope
SpacetimeDB server module config and binding-generation workflow.

## Files
- `spacetime.json` / `spacetime.local.json`: module/db configuration.
- `generate-bindings.sh`: generates TypeScript bindings into `pixijs/src/spacetime/bindings`.
- `spacetimedb/`: Rust schema + reducer implementation.

## Workflow rules
- After table/reducer signature changes in `spacetimedb/src/lib.rs`, regenerate bindings; do not hand-maintain drift in client bindings.
- Keep generation script paths accurate (`spacetimedb` module path and PixiJS bindings out dir).
- Prefer additive, explicit schema/reducer changes and keep reducer parameter naming consistent with generated client call sites.
