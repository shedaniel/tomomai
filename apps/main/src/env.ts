import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const flag = z.enum(["true", "false"]).optional();
const port = z.string().regex(/^\d+$/, "must be a port number");

// NODE_ENV and NEXT_RUNTIME stay as direct process.env reads so Next can
// inline them and drop dead branches.
export const env = createEnv({
  server: {
    POSTGRES_URL: z.url(),
    REDIS_URL: z.url(),

    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.url().optional(),
    TRUSTED_ORIGINS: z.string().optional(),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    DISCORD_CLIENT_ID: z.string().optional(),
    DISCORD_CLIENT_SECRET: z.string().optional(),
    TWITTER_CLIENT_ID: z.string().optional(),
    TWITTER_CLIENT_SECRET: z.string().optional(),
    ALTCHA_HMAC_KEY: z.string().optional(),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    TURNSTILE_EXPECTED_HOSTNAME: z.string().optional(),

    TOKEN_SECRET: z.string().regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (openssl rand -hex 32)"),
    MAIMAI_TOTP_SECRET: z.string().min(1),
    ADMIN_UPDATE_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().optional(),

    R2_ENDPOINT: z.url(),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_FORCE_PATH_STYLE: flag,

    RENDER_TOKEN_SECRET: z.string().optional(),
    RENDER_PUBLIC_URL: z.url().optional(),
    RENDER_INTERNAL_URL: z.url().optional(),

    DISCORD_PUBLIC_KEY: z.string().optional(),
    DISCORD_UPDATE_WEBHOOK: z.url().optional(),
    DISCORD_UPDATE_WEBHOOK_INTL: z.url().optional(),
    DISCORD_UPDATE_WEBHOOK_JP: z.url().optional(),
    DISCORD_UPDATE_WEBHOOK_CN: z.url().optional(),
    DISCORD_UPDATE_WEBHOOK_NOTICE: z.url().optional(),

    USERSCRIPT_CLIENT_ID: z.string().optional(),
    USERSCRIPT_CLIENT_SECRET: z.string().optional(),

    OPENROUTER_KEY: z.string().optional(),
    AI_MODEL: z.string().default("anthropic/claude-sonnet-4-5-20250514"),

    DIVINGFISH_DEV_TOKEN: z.string().optional(),
    LXNS_CLIENT_ID: z.string().optional(),
    LXNS_CLIENT_SECRET: z.string().optional(),
    LXNS_REDIRECT_URI: z.url().optional(),
    CN_PROXY_HOST: z.string().optional(),
    CN_PROXY_PORT: port.default("2560"),
    CN_PROXY_TOKEN_SECRET: z.string().optional(),
    DEBUG_CN_FETCH: z.string().optional(),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    DEV_LOGTAIL_SOURCE_TOKEN: z.string().optional(),
    INGESTING_HOST: z.string().optional(),
    AXIOM_TOKEN: z.string().optional(),
    AXIOM_DATASET: z.string().optional(),
    AXIOM_URL: z.string().default("api.axiom.co"),

    EDGE_CONFIG: z.string().optional(),
    DEMO_FETCH: flag,
    SITE_URL: z.string().optional(),

    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
    VERCEL_URL: z.string().optional(),
    VERCEL_BRANCH_URL: z.string().optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_SITE_URL: z.string().optional(),
    NEXT_PUBLIC_APP_URL: z.url().optional(),
    NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE: z.enum(["disabled", "invite-only", "enabled"]).default("disabled"),
    NEXT_PUBLIC_ENABLED_REGIONS: z.string().optional(),
    NEXT_PUBLIC_R2_URL: z.url(),
    NEXT_PUBLIC_R2_URL_CN: z.url().optional(),
    NEXT_PUBLIC_DISCORD_APPLICATION_ID: z.string().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_CN_PROXY_HOST: z.string().optional(),
    NEXT_PUBLIC_CN_PROXY_PORT: port.optional(),
  },
  // Frozen at build time by next.config.ts.
  shared: {
    APP_VERSION_MINOR: z.string().default("0.0"),
    BUILD_STAMP: z.string().default("dev"),
    GIT_SHA: z.string().default("dev"),
  },
  // Client and shared vars must be referenced literally so Next inlines them.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE: process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE,
    NEXT_PUBLIC_ENABLED_REGIONS: process.env.NEXT_PUBLIC_ENABLED_REGIONS,
    NEXT_PUBLIC_R2_URL: process.env.NEXT_PUBLIC_R2_URL,
    NEXT_PUBLIC_R2_URL_CN: process.env.NEXT_PUBLIC_R2_URL_CN,
    NEXT_PUBLIC_DISCORD_APPLICATION_ID: process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_CN_PROXY_HOST: process.env.NEXT_PUBLIC_CN_PROXY_HOST,
    NEXT_PUBLIC_CN_PROXY_PORT: process.env.NEXT_PUBLIC_CN_PROXY_PORT,
    APP_VERSION_MINOR: process.env.APP_VERSION_MINOR,
    BUILD_STAMP: process.env.BUILD_STAMP,
    GIT_SHA: process.env.GIT_SHA,
  },
  emptyStringAsUndefined: true,
  // Escape hatch for builds that run without the real secrets (e.g. Docker image builds).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
