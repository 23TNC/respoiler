# AGENTS.md

## Scope
PixiJS client app: rendering, interaction, and client-side state composition.

## Responsibilities
- Build UI from `src/game/**` and static definitions from `src/data/**`.
- Consume SpacetimeDB rows through `src/spacetime/client.ts` + generated bindings.
- Derive view models in shared helpers (for example runtime card classification/state derivation) before rendering.

## What belongs here
- Scene orchestration, board/inventory UI, drag/drop behavior, staged action UX.
- Static data loading/validation for cards, tiles, verbs, recipes.
- Adapter logic that maps server rows into client-friendly structures.

## What does NOT belong here
- Authoritative runtime game state ownership.
- Silent semantic remapping to hide broken/missing server schema data.
- One-off card-type inference sprinkled across unrelated UI files.

## Source-of-truth expectations
- Canonical card classification should come from static card definitions where available.
- Runtime instances should normalize through shared classification helpers.
- Unknown/unsupported card kinds should be surfaced (warn/log) rather than auto-invented categories.

## Workflow expectations
- Prefer smallest correct change set.
- Preserve existing visual/style patterns unless requested otherwise.
- Do not reintroduce deprecated terminology unless compatibility requires it.
