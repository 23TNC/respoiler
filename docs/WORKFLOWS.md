# WORKFLOWS

## Before editing
1. Read `docs/STACK.md` + `docs/ARCHITECTURE.md`.
2. Inspect target module and nearby files for established patterns.
3. Confirm whether data belongs in JSON/static definitions rather than inline code.

## Finding relevant files quickly
- Use `rg "symbol_or_feature" pixijs/src spacetime/server/spacetimedb/src`.
- Start from entry points (`pixijs/src/main.ts`, `pixijs/src/ui/game_view.ts`, `spacetime/server/spacetimedb/src/lib.rs`).
- For schema/client sync work, inspect `pixijs/src/spacetime/bindings/` and `spacetime/server/generate-bindings.sh`.

## Avoid duplicating logic
- Reuse existing packing/decoding helpers before adding new coordinate/bitfield code.
- Extend current panel/input abstractions before adding parallel subsystems.
- Prefer updating existing definition loaders over creating alternate registries.

## Minimal-change execution
- Keep diffs local to the feature/fix scope.
- Preserve naming/layout conventions in the touched directory.
- Add TODO comments only when unavoidable, and make them specific/actionable.

## Maintaining helper docs
- Update these docs when stack versions, directory layout, or workflows change.
- Keep helper docs brief, factual, and repo-derived (no speculative guidance).
