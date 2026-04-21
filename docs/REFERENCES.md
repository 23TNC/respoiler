# REFERENCES

## Preferred documentation
- PixiJS: https://pixijs.download/release/docs/index.html
- SpaceTimeDB Rust docs: https://docs.rs/spacetimedb/latest/spacetimedb/
- Godot scripting (only if relevant): https://docs.godotengine.org/en/stable/tutorials/scripting/index.html

## Key repo version references
- Client package versions: `pixijs/package.json`
- TypeScript compiler options: `pixijs/tsconfig.json`
- Vite config: `pixijs/vite.config.ts`
- Rust SpaceTimeDB crate version: `spacetime/server/spacetimedb/Cargo.toml`

## Repo commands/locations worth remembering
- Frontend: `cd pixijs && npm run dev|build|preview`
- SpaceTimeDB binding generation: `cd spacetime/server && bash generate-bindings.sh`
- Generated bindings output: `pixijs/src/spacetime/bindings/`
- SpaceTimeDB module source: `spacetime/server/spacetimedb/src/`

## Version verification reminder
Before assuming APIs, verify installed/pinned versions directly from repo manifests and lock/config files.
