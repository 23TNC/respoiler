# STACK

## Main technologies
- **PixiJS 8.9.1** (`pixijs/package.json`): 2D rendering/UI for the client.
- **TypeScript 5.8.3** (`pixijs/package.json`, `pixijs/tsconfig.json`): strict client typing and build-time checks.
- **Vite 5.4.19** (`pixijs/package.json`, `pixijs/vite.config.ts`): frontend dev server/build pipeline.
- **SpaceTimeDB 2.1.0 (guidance target)**: backend patterns + generated client bindings workflow.

## Where each is used
- `pixijs/`: Vite + TypeScript project rendering panel-based UI through PixiJS.
- `spacetime/server/spacetimedb/`: Rust SpaceTimeDB module (tables/reducers/bootstrap logic).
- `spacetime/server/generate-bindings.sh`: generates TypeScript bindings into `pixijs/src/spacetime/bindings/`.

## Compatibility notes from repo files
- Client pins `pixi.js` to `8.9.1`, `typescript` to `5.8.3`, and `vite` to `5.4.19`.
- Client SpaceTimeDB SDK is `^2.1.0` (npm package `spacetimedb`).
- Rust server crate currently pins `spacetimedb = "=2.0.3"`; treat this as a practical compatibility constraint until upgraded.
- `tsconfig.json` uses `moduleResolution: "Bundler"`, `strict: true`, `resolveJsonModule: true`, and `noEmit: true`.

## Do not assume newer APIs
Do not use APIs from newer PixiJS/SpaceTimeDB/TypeScript/Vite versions unless the repository’s package/config files already support them. Verify versions in repo manifests before introducing syntax or runtime calls.
