import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    GUESS_DAILY_SECRET: z.string().min(16, "generate with openssl rand -hex 32"),
    GUESS_HINT_COUNT: z.coerce.number().int().min(2).default(6),
    DEBUG_KEY: z.string().optional(),

    TOMOMAI_API_URL: z.url().optional(),
    TOMOMAI_AUTH_URL: z.url().optional(),
    TOMOMAI_OAUTH_CLIENT_ID: z.string().optional(),
    TOMOMAI_OAUTH_CLIENT_SECRET: z.string().optional(),

    POSTGRES_URL: z.url().optional(),
    REDIS_URL: z.url().optional(),

    TURNSTILE_SECRET_KEY: z.string().optional(),
    TURNSTILE_EXPECTED_HOSTNAME: z.string().optional(),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
    VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_SITE_URL: z.url().optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    NEXT_PUBLIC_GUESSER_MODE: z.enum(["guess", "heardle"]).default("guess"),
    NEXT_PUBLIC_DEBUG_ANIMATION: z.string().optional(),
  },
  // Client vars must be referenced literally so Next inlines them.
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    NEXT_PUBLIC_GUESSER_MODE: process.env.NEXT_PUBLIC_GUESSER_MODE,
    NEXT_PUBLIC_DEBUG_ANIMATION: process.env.NEXT_PUBLIC_DEBUG_ANIMATION,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
