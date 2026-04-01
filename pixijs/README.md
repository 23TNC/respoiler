# PixiJS Card Recipe Prototype

## Run

```bash
npm install
npm run dev
```

## Data mode switch

Use local JSON (default):

```bash
VITE_DATA_MODE=local npm run dev
```

Switch to SpacetimeDB provider stub:

```bash
VITE_DATA_MODE=spacetimedb npm run dev
```

The SpacetimeDB provider currently falls back to local JSON while keeping a provider interface ready for backend integration.
