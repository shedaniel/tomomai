POSTGRES_PORT ?= 5432
REDIS_PORT ?= 6379
S3_PORT ?= 9000
export POSTGRES_PORT REDIS_PORT S3_PORT

# Always the docker compose services, never whatever .env.local points at.
LOCAL_DB_ENV = POSTGRES_URL=postgres://tomomai:tomomai@localhost:$(POSTGRES_PORT)/tomomai
LOCAL_GUESS_DB_ENV = POSTGRES_URL=postgres://tomomai:tomomai@localhost:$(POSTGRES_PORT)/guess
LOCAL_S3_ENV = R2_ENDPOINT=http://localhost:$(S3_PORT) R2_FORCE_PATH_STYLE=true \
	R2_ACCESS_KEY_ID=tomomai R2_SECRET_ACCESS_KEY=tomomai-dev-secret R2_BUCKET=tomomai

.PHONY: setup env up down migrate seed reset discord-tunnel discord-register

setup: env up migrate seed
	@echo "Local stack ready. Run: pnpm dev"

env:
	@./scripts/dev-env.sh

up:
	docker compose up -d --wait postgres redis rustfs
	docker compose run --rm s3-init

down:
	docker compose down

migrate:
	cd apps/main && $(LOCAL_DB_ENV) pnpm exec drizzle-kit migrate
	@docker compose exec -T postgres psql -U tomomai -d tomomai -tAc \
		"SELECT 1 FROM pg_database WHERE datname = 'guess'" | grep -q 1 \
		|| docker compose exec -T postgres createdb -U tomomai guess
	cd apps/guess && $(LOCAL_GUESS_DB_ENV) pnpm exec drizzle-kit migrate

seed:
	cd apps/main && $(LOCAL_DB_ENV) $(LOCAL_S3_ENV) pnpm db:seed

# Wipes the local volumes (database, redis, bucket) and rebuilds from scratch.
reset:
	docker compose down -v
	$(MAKE) up migrate seed

# Public URL for Discord's Interactions Endpoint, pointing at `pnpm dev`.
# FORCE=1 replaces an endpoint that is not a quick tunnel.
discord-tunnel:
	@./scripts/discord-tunnel.sh

# Needs NEXT_PUBLIC_DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in .env.local.
discord-register:
	cd apps/main && pnpm discord:register
