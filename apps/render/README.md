# @tomomai/render

Standalone image-render service, extracted from `apps/main` to move the rendered
webp **egress off Vercel** (Fast Origin Transfer). `apps/main` does auth, mints a
short-lived signed token, and 302s the client here; this service verifies the
token, renders with `skia-canvas`, and serves the webp directly.

Output is a **byte-identical lift-and-shift** of `apps/main`'s renderer (same
skia `toBuffer`, `density=scale`, `quality 0.85`). Encode tuning (sharp / `@1x`)
is a deliberate later step.

## Routes

`GET /img?t=<token>[&profile=1]` — `profile=1` is dev-only (prints a span tree).
The token payload (`src/token.ts`) carries `route` + the already-authorized
identity (`snapshotId` | `userId` | reserved `username`) + `region`/`scale` and
route params (`day`, `beforeDate`). `route` selects the handler:
`export-image` | `last-credit` | `daily-plays`.

`GET /health` — liveness.

## Run

```sh
cp .env.example .env   # set RENDER_TOKEN_SECRET (must match apps/main), POSTGRES_URL, PUBLIC_DIR
pnpm --filter @tomomai/render dev
```

This app **owns its own** `/res` assets under `public/res` — a curated ~35MB
subset (only the image dirs + 5 `FontLibrary.use()` fonts skia actually reads),
not the website's full 122MB tree. The render-composite assets have zero
browser/UI use in `apps/main`; they belonged to the renderer all along. `PUBLIC_DIR`
defaults to `process.cwd()/public`, so dev needs no config; Docker uses /app/public.

If a renderer adds a new `/res` category, drop it into `public/res` (a missing
asset 502s loudly at request time). `public/res/preloaded` is a runtime cover
cache and is gitignored.

## Deploy

```sh
docker build -f apps/render/Dockerfile -t tomomai-render .   # build from repo root
```

Run on any cheap-egress host (Fly / Railway / Cloud Run / Hetzner). Long-lived
process, so the in-memory decoded-image cache and DB pool stay warm across
requests (unlike Vercel lambdas).

## Notes / debt

- Domain logic (`lib/metadata`, `lib/score-details`, `lib/rating-calculator`,
  `server/services/*`, …) is **copied** from `apps/main`, not shared — the
  upcoming catalogue PR extracts these into a shared package; reconcile then.
- `apps/main` still owns the `/api/export-image`, `/api/last-credit`,
  `/api/daily-plays` routes; wiring them to mint a token + 302 here is the next
  step.
