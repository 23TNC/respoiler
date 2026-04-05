# AGENTS.md

## Scope
SpacetimeDB project and server-side tooling.

## Responsibilities
- Own authoritative runtime multiplayer/gameplay state schema.
- Define reducers for state transitions and bootstrap/seed flows.
- Provide generated client bindings consumed by `pixijs`.

## Expectations
- Keep table/reducer names and field shapes stable unless making an intentional schema change.
- Prefer explicit reducer validation (ownership, host existence, kind checks) over client-side trust.
- Bootstrap flows should be idempotent when intended for repeated startup use.

## Client contract
- Client-visible table shapes must remain predictable for generated bindings.
- When schema changes, regenerate bindings and update client usage rather than preserving broken compatibility hacks.
