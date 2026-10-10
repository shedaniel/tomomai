POSTGRES_PORT ?= 5432
REDIS_PORT ?= 6379
S3_PORT ?= 9000
export POSTGRES_PORT REDIS_PORT S3_PORT

# Always the docker compose services, never whatever .env.local points at.
LOCAL_DB_ENV = POSTGRES_URL=postgres://tomomai:tomomai@localhost:$(POSTGRES_PORT)/tomomai
LOCAL_S3_ENV = R2_ENDPOINT=http://localhost:$(S3_PORT) R2_FORCE_PATH_STYLE=true \
	R2_ACCESS_KEY_ID=tomomai R2_SECRET_ACCESS_KEY=tomomai-dev-secret R2_BUCKET=tomomai

.PHONY: setup env up down migrate seed reset

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

seed:
	cd apps/main && $(LOCAL_DB_ENV) $(LOCAL_S3_ENV) pnpm db:seed

# Wipes the local volumes (database, redis, bucket) and rebuilds from scratch.
reset:
	docker compose down -v
	$(MAKE) up migrate seed
