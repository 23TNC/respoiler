# AGENTS.md

## Scope
Primary TypeScript source for the live client.

## Layout guide
- `game/`: gameplay domain models, staging/validation, renderers, scene/UI orchestration.
- `data/`: static JSON + strict loaders for cards/tiles/verbs/recipes.
- `spacetime/`: DB client integration, row subscriptions, generated bindings, runtime derivation helpers.

## Boundaries
- Keep pure data validation/parsing in `data/` loaders.
- Keep server-row-to-view-model transforms in `spacetime/deriveRuntimeState.ts` and related helpers.
- Keep visual interactions (board, inventory, drag/drop) in `game/ui` + scene wiring.

## Source-of-truth rules
- Card group/category resolution should flow through shared classification helpers (`game/cards/classification.ts`).
- Recipe staging checks should use recipe helpers (`game/recipes/**`), not ad-hoc conditional logic in scene/UI code.
- Avoid duplicate card classification logic in both data loaders and rendering components.

## Current drift / watchouts
- `src/src/**` mirrors part of this tree and appears stale/duplicate; treat `src/**` as the active path unless a task is explicitly about cleanup/migration.
