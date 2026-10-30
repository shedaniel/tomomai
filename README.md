# tomomai ともマイ

A modern web application for tracking and analyzing your maimai DX scores with friends. Built with Next.js 16, TypeScript, and Tailwind CSS.

## Repository Layout

| Path | Package | What it is |
|---|---|---|
| `apps/main` | `@tomomai/site` | The main site, API and Discord bot (port 3000) |
| `apps/guess` | `@tomomai/guess` | The guesser / heardle minigames (port 3001) |
| `apps/render` | `@tomomai/render` | Standalone image-render service (port 8080) |
| `packages/*` | `@tomomai/*` | Shared UI, i18n, security, utils and render-token code |
| `proxy/` | — | Go HTTP proxy for the CN WeChat OAuth flow |
| `rating-analyser/` | — | Python rating analysis tooling |

## Local Development

The local stack runs Postgres, Redis and [RustFS](https://github.com/rustfs/rustfs) (an S3 stand-in for R2) in Docker, while the apps run on your machine with `pnpm`.

### Prerequisites

- Node.js 22 and pnpm (`corepack enable` picks up the pinned version)
- Docker with Compose v2
- `make` and `openssl`

### Quick Start

```bash
git clone https://github.com/shedaniel/tomomai.git
cd tomomai
pnpm install
make setup
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) and use **Continue as anonymous user** in the sign-in dialog. This dev-only sign-in needs no Discord or X credentials.

`make setup` does the following:

1. Writes `.env.local` (with generated secrets), symlinks it to `apps/main/.env.local`, and creates `apps/render/.env.local` and `apps/guess/.env.local`. Existing env files are never overwritten.
2. Starts Postgres, Redis and RustFS, and creates a public-read `tomomai` bucket.
3. Applies migrations to the `tomomai` (main) and `guess` databases.
4. Seeds the song catalogue from [tomomai.lol](https://www.tomomai.lol) and mirrors the catalogue JSON into the local bucket.

### Make Targets

| Target | What it does |
|---|---|
| `make setup` | `env` + `up` + `migrate` + `seed`. Safe to re-run |
| `make env` | Create any missing local env files |
| `make up` | Start the Docker services and create the bucket |
| `make down` | Stop the Docker services (data is kept) |
| `make migrate` | Apply main and guess migrations to the local databases |
| `make seed` | Re-seed songs into the local database and bucket |
| `make reset` | Delete all local data (database, Redis, bucket) and rebuild it from scratch |

`make migrate` and `make seed` always target the Docker services, not whatever `.env.local` points at. The seed script also refuses to run against a non-local database.

### Services and Ports

| Service | Default port | Override |
|---|---|---|
| `apps/main` (`pnpm dev`) | 3000 | — |
| `apps/guess` (`pnpm guess:dev`) | 3001 | — |
| `apps/render` (`pnpm render:dev`) | 8080 | `PORT` in `apps/render/.env.local` |
| Postgres | 5432 | `POSTGRES_PORT` |
| Redis | 6379 | `REDIS_PORT` |
| RustFS (S3 API) | 9000 | `S3_PORT` |
| RustFS console | 9001 | `S3_CONSOLE_PORT` |

Docker ports bind to `127.0.0.1` only. If a default port is taken, pass the same override to every `make` call, e.g. `make setup POSTGRES_PORT=55432`. The generated env files use whatever ports were set when they were first written.

Postgres credentials are `tomomai` / `tomomai`. RustFS credentials are `tomomai` / `tomomai-dev-secret`.

### Running the Other Apps

- **Render service**: run `pnpm render:dev` to serve profile exports, last-credit and daily-plays images. `make setup` gives it the same `RENDER_TOKEN_SECRET` as `apps/main` and points it at your local `apps/main` for the song catalogue, so keep `pnpm dev` running.
- **Guesser**: run `pnpm guess:dev`. It reads the song catalogue from your local `apps/main`, so keep `pnpm dev` running. To test "Sign in with tomomai", create an OAuth app at [http://localhost:3000/settings/developer](http://localhost:3000/settings/developer) and fill in `TOMOMAI_OAUTH_CLIENT_ID` and `TOMOMAI_OAUTH_CLIENT_SECRET` in `apps/guess/.env.local`.
- **Real OAuth / Discord bot**: fill in the Discord or X credentials in `.env.local`. See [SETUP.md](SETUP.md#discord) for how to create them.

### Scripts

```bash
pnpm dev                  # Main site with Turbopack
pnpm guess:dev            # Guesser
pnpm render:dev           # Render service
pnpm build                # Production build of the main site
pnpm lint                 # ESLint across the workspace
pnpm typecheck            # tsc across the workspace
pnpm test                 # Vitest (main site)

pnpm db:generate          # Generate a migration from apps/main/src/lib/db/schema-pg.ts
pnpm db:studio            # Open Drizzle Studio
pnpm tunnel               # Expose localhost:3000 via a Cloudflare tunnel
```

To change the database schema, edit the schema file and run `db:generate`, then `make migrate` to apply it locally. The guess app's schema is `apps/guess/src/lib/db/schema.ts`; generate its migrations with `pnpm --filter @tomomai/guess db:generate`.

### Contributing

Commit messages and PR titles follow [docs/COMMIT_CONVENTION.md](docs/COMMIT_CONVENTION.md). Logging follows [docs/LOGGING.md](docs/LOGGING.md).

## Deployment

Production runs as separate deployments:

| Component | Host | Needs |
|---|---|---|
| `apps/main` | Vercel | Postgres, Redis, Cloudflare R2, Vercel Edge Config, Discord application |
| `apps/guess` | Vercel (separate project per variant) | Optional Postgres (its own database) and Redis |
| `apps/render` | Any long-lived Docker host (Fly, Railway, Cloud Run, Hetzner, ...) | A `RENDER_TOKEN_SECRET` shared with `apps/main` |
| `proxy/` | CN-reachable VPS (optional) | Only for the CN WeChat OAuth flow |

See [SETUP.md](SETUP.md#deployment) for the full guide: environment variables for each app, database migrations, Discord setup, Docker builds, and populating song and event data.

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **SEGA** for creating maimai DX
- **[dxrating](https://github.com/gekichumai/dxrating)** for providing internal level data
- **[otoge-db](https://github.com/zvuc/otoge-db)** for providing level data
