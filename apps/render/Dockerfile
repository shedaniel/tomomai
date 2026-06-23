# Build from the REPO ROOT so the pnpm workspace and apps/main's assets are in context:
#   docker build -f apps/render/Dockerfile -t tomomai-render .
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable
# skia-canvas / sharp runtime libs (fontconfig is needed for font loading).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libfontconfig1 libfreetype6 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# --- deps: install only what @tomomai/render needs ---
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/render/package.json apps/render/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/utils/package.json packages/utils/package.json
RUN pnpm install --frozen-lockfile --filter @tomomai/render...

# --- runtime ---
FROM base AS runtime
ENV NODE_ENV=production PORT=8080 PUBLIC_DIR=/app/public
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/render/node_modules ./apps/render/node_modules
COPY packages/i18n packages/i18n
COPY packages/utils packages/utils
COPY apps/render/package.json apps/render/tsconfig.json apps/render/
COPY apps/render/src apps/render/src
# render owns its own curated ~35MB /res subset (only what skia reads — see
# apps/render/public/res). No reaching into apps/main.
COPY apps/render/public/res /app/public/res
WORKDIR /app/apps/render
EXPOSE 8080
CMD ["pnpm", "start"]
