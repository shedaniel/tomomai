import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin, apiKey, openAPI } from "better-auth/plugins";
import { and, count, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./db/schema-pg";
import { logger } from "@/lib/logger";

const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled'; // disabled, invite-only, enabled
const SIGNUP_REQUIRED_AMOUNT = 128;
// Helper function to check if invites are required based on user count
async function checkInviteRequirement(): Promise<boolean> {
  if (SIGNUP_TYPE !== 'invite-only') {
    return SIGNUP_TYPE === 'disabled'; // Always require invite if disabled, never if enabled
  }

  // For invite-only mode, check user count
  const [userCount] = await db
    .select({ count: count() })
    .from(schema.user);

  return userCount.count >= SIGNUP_REQUIRED_AMOUNT;
}

// Helper function to validate and claim invitations
async function validateAndClaimInvite(inviteCode: string, userId: string) {
  const now = new Date();

  // Auto-cleanup old/revoked/expired invites
  try {
    await db
      .delete(schema.invites)
      .where(
        or(
          eq(schema.invites.revoked, true),
          and(
            lt(schema.invites.expiresAt, now),
            isNull(schema.invites.claimedBy)
          )
        )
      );
  } catch (error) {
    logger.error({ error, context: "auto-cleanup" }, "Auto-cleanup failed");
  }

  // Find the invitation
  const [invite] = await db
    .select({
      id: schema.invites.id,
      code: schema.invites.code,
      createdBy: schema.invites.createdBy,
      claimedBy: schema.invites.claimedBy,
      createdAt: schema.invites.createdAt,
      expiresAt: schema.invites.expiresAt,
      revoked: schema.invites.revoked,
    })
    .from(schema.invites)
    .where(eq(schema.invites.code, inviteCode))
    .limit(1);

  if (!invite) {
    throw new Error("Invalid invitation code");
  }

  // Check if invitation is valid
  if (invite.revoked) {
    throw new Error("This invitation has been revoked");
  }

  if (invite.claimedBy) {
    throw new Error("This invitation has already been used");
  }

  if (new Date(invite.expiresAt) <= now) {
    throw new Error("This invitation has expired");
  }

  // Check for self-claiming
  if (invite.createdBy === userId) {
    throw new Error("You cannot use your own invitation code");
  }

  // Claim the invitation
  await db
    .update(schema.invites)
    .set({
      claimedBy: userId,
      claimedAt: now,
    })
    .where(eq(schema.invites.id, invite.id));

  return invite;
}

// --- Multi-hostname config (e.g. tomomai.lol + cn.tomomai.lol via the HK
// proxy in cn/) is driven by env vars so the same code works across
// deployments without per-domain edits. See cn/README.md.
//
// TRUSTED_ORIGINS:    comma-separated origins allowed for OAuth callbacks /
//                     CORS. Falls back to unset → Better Auth's default
//                     (single-origin, derived from request host).
// AUTH_COOKIE_DOMAIN: cookie domain for cross-subdomain sessions (e.g.
//                     ".tomomai.lol" so cn.tomomai.lol shares sessions with
//                     the apex). Omit for single-hostname deployments.
const trustedOrigins = (process.env.TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;

export const auth = betterAuth({
  ...(trustedOrigins.length ? { trustedOrigins } : {}),
  advanced: {
    // Honour x-forwarded-host / x-forwarded-proto when computing the base
    // URL Better Auth uses for OAuth redirect_uri, cookie domain inference,
    // etc. Without this, Better Auth falls back to `request.url` — which in
    // local `pnpm dev` is http://localhost:3000 even when the request came
    // in via the cn/ HK proxy (or via cloudflared tunnel during e2e dev),
    // breaking Discord login by sending users back to localhost. Vercel
    // and the cn/ Caddy both set these headers, so trusting them is safe
    // — there is no path where an untrusted client can reach the app
    // without going through one of them.
    trustedProxyHeaders: true,
    ...(authCookieDomain
      ? {
          crossSubDomainCookies: { enabled: true, domain: authCookieDomain },
          defaultCookieAttributes: {
            domain: authCookieDomain,
            sameSite: "lax",
            secure: true,
          },
        }
      : {}),
  },
  emailAndPassword: {
    enabled: false,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: process.env.BETTER_AUTH_SECRET || "development-secret-change-in-production",
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      disableImplicitSignUp: true,
    },
  },
  plugins: [
    nextCookies(),
    admin(),
    apiKey({
      enableMetadata: true,
      defaultPrefix: "tmk_",
      startingCharactersConfig: { shouldStore: true, charactersLength: 8 },
      permissions: {
        defaultPermissions: { ready: ["access"] },
      },
    }),
    ...(process.env.NODE_ENV === 'development' ? [openAPI()] : []),
  ],
  disabledPaths: [
    "/reset-password",
    "/reset-password/{token}",
    "/change-password",
    "/change-email",
    "/verify-email",
    "/send-verification-email",
    "/request-password-reset",
    "/sign-up/email",
    "/sign-in/email",
    "/delete-user",
    "/delete-user/callback",
    "/link-social",
    "/unlink-account",
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          const inviteRequired = await checkInviteRequirement();

          if (SIGNUP_TYPE === 'disabled') {
            throw new Error("unable_to_create_user");
          }

          // Check if invitation is required based on dynamic logic
          if (inviteRequired) {
            let inviteCode: string | null = null;

            // Try to extract invitation code from cookies
            if (context?.request) {
              const cookieHeader = context.request.headers.get('cookie');
              if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                  const [key, value] = cookie.trim().split('=');
                  acc[key] = value;
                  return acc;
                }, {} as Record<string, string>);

                inviteCode = cookies.pendingInviteCode || null;
              }
            }

            if (!inviteCode) {
              console.log("No invitation code found in cookies during signup");
              throw new Error("Invitation required for signup");
            }

            console.log(`Found invitation code during signup: ${inviteCode}`);

            // Validate invitation (we'll claim it in the after hook)
            const now = new Date();
            const [invite] = await db
              .select({
                id: schema.invites.id,
                createdBy: schema.invites.createdBy,
                claimedBy: schema.invites.claimedBy,
                expiresAt: schema.invites.expiresAt,
                revoked: schema.invites.revoked,
              })
              .from(schema.invites)
              .where(eq(schema.invites.code, inviteCode))
              .limit(1);

            if (!invite) {
              throw new Error("Invalid invitation code");
            }

            if (invite.revoked) {
              throw new Error("This invitation has been revoked");
            }

            if (invite.claimedBy) {
              throw new Error("This invitation has already been used");
            }

            if (new Date(invite.expiresAt) <= now) {
              throw new Error("This invitation has expired");
            }
          }

          return { data: user };
        },
        after: async (user, context) => {
          // Check if invitation was used (and claim it if so)
          const inviteRequired = await checkInviteRequirement();

          if (inviteRequired) {
            let inviteCode: string | null = null;

            // Read the invitation code from cookies again
            if (context?.request) {
              const cookieHeader = context.request.headers.get('cookie');
              if (cookieHeader) {
                const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
                  const [key, value] = cookie.trim().split('=');
                  acc[key] = value;
                  return acc;
                }, {} as Record<string, string>);

                inviteCode = cookies.pendingInviteCode || null;
              }
            }

            if (inviteCode) {
              console.log(`Attempting to claim invitation ${inviteCode} for user ${user.id}`);
              try {
                await validateAndClaimInvite(inviteCode, user.id);
                console.log(`Successfully claimed invitation ${inviteCode} for user ${user.id}`);
              } catch (error) {
                logger.error({ error, context: "invite-claim", userId: user.id, inviteCode }, "Failed to claim invitation");
                // Note: At this point the user is already created, so we can't easily roll back
                // In a production system, you might want to implement compensation logic
              }
            } else {
              console.log(`No invitation code found in after hook for user ${user.id}`);
            }
          }
        },
      },
    },
  },
});
