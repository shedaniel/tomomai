import { NextRequest, NextResponse } from "next/server";
import { countDistinct, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthClient, oauthConsent } from "@/lib/db/schema-pg";
import { isOfficialClient, usageBucket } from "@/lib/oauth-official";
import { oauthClientPublicLimiter, rateLimit } from "@/lib/security/redis-rate-limit";

export const runtime = "nodejs";

/** Trust signals for the consent screen: official status, registration date and a coarse user count. */
export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const limited = await rateLimit(request, oauthClientPublicLimiter);
  if (limited) return limited;

  const { clientId } = await context.params;
  const [client] = await db
    .select({ metadata: oauthClient.metadata, createdAt: oauthClient.createdAt, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!client || client.disabled) return NextResponse.json({ error: "client not found" }, { status: 404 });

  const [usage] = await db
    .select({ users: countDistinct(oauthConsent.userId) })
    .from(oauthConsent)
    .where(eq(oauthConsent.clientId, clientId));

  return NextResponse.json(
    {
      official: isOfficialClient(client.metadata),
      createdAt: client.createdAt?.toISOString() ?? null,
      usage: usageBucket(usage?.users ?? 0),
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=600" } },
  );
}
