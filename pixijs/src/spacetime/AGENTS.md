# AGENTS.md

## Scope
Client integration layer for SpacetimeDB.

## Responsibilities
- Maintain DB connection/subscriptions and reducer calls (`client.ts`).
- Convert raw table rows into client runtime models (`deriveRuntimeState.ts`).
- Hold generated TS bindings in `bindings/`.

## Source-of-truth rules
- Treat server rows as authoritative runtime data.
- Use static card definitions only to enrich/classify runtime cards when IDs match.
- Keep row-to-model normalization centralized; do not scatter row-shape assumptions in scene/UI files.

## Bindings workflow
- `bindings/` is generated output; regenerate from server schema changes (via server script) instead of hand-editing generated files.
- If generated types and app code diverge, fix schema/bindings flow first, then adjust callers.

## Current drift / watchouts
- `deriveRuntimeState` currently maps unknown world tile names to a fallback tile type; avoid expanding fallback behavior without aligning server tile naming/static tile definitions.
