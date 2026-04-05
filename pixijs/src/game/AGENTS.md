# AGENTS.md

## Scope
Gameplay-facing client logic: scene composition, board/inventory behavior, staged/queued actions, rendering helpers.

## Expectations
- `scenes/` coordinates data flow between static data, Spacetime runtime rows, and UI widgets.
- `ui/` components should receive normalized models; avoid embedding server-shape assumptions deep in widgets.
- `actions/` and `recipes/` modules are the gatekeepers for staged action validity.

## Terminology in this subtree
- **technique** cards drive primary staged action verbs.
- **essence** and **sundries** are staged inputs for recipe matching.
- **tile** means either world hex tile or soul-hosted/event tile.
- **queued** means client-side queued action state prepared by validated staged actions.

## Constraints
- Keep board/inventory/drag-drop behavior deterministic from current derived state.
- Prefer shared helpers for card labels/colors/category derivation instead of per-widget logic.
- If a runtime card cannot be classified, do not silently coerce it into an arbitrary UI bucket.
