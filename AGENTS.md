# AGENTS.md

## Project purpose
Respoiler is a two-part project: a PixiJS + TypeScript client in `pixijs/` and a SpaceTimeDB-backed Rust module in `spacetime/server/spacetimedb/`. The client renders a panel-based card/board UI and consumes SpaceTimeDB data through generated TypeScript bindings. The backend models cards, players, zones, and actions, then exposes reducers/tables consumed by the client. These helper docs are intentionally compact so coding agents can load stable project context with fewer tokens.

## Stack + preferred versions
Use these versions as the primary guidance target for code suggestions and API usage:
- SpaceTimeDB: **2.1.0**
- PixiJS: **8.9.1**
- TypeScript: **5.8.3**
- Vite: **5.4.19**

Version-target rules:
- All PixiJS code and API usage must be compatible with **PixiJS 8.9.1**.
- All SpaceTimeDB guidance should target **2.1.0** behavior/patterns.
- All TypeScript examples should target **5.8.3** syntax/tooling expectations.
- All Vite-related guidance should assume **5.4.19**.
- If repo manifests show a mismatch, prefer minimal-change compatibility and call out the mismatch explicitly.

## Before changing code (checklist)
- Inspect existing architecture and nearby modules first.
- Prefer minimal diffs over broad rewrites.
- Preserve established naming and file structure.
- Avoid introducing new patterns unless necessary.
- Avoid hardcoding data that belongs in definitions/JSON/static data.

## Documentation sources
Preferred references:
- PixiJS docs: https://pixijs.download/release/docs/index.html
- SpaceTimeDB Rust docs: https://docs.rs/spacetimedb/latest/spacetimedb/
- Godot scripting docs (only if relevant): https://docs.godotengine.org/en/stable/tutorials/scripting/index.html

Guidance:
- When working on Pixi code, prefer the PixiJS docs above over random blog posts.
- Consult helper files in `docs/` before broad refactors; they exist to reduce repeated prompt context and keep changes consistent.
