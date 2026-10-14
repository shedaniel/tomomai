import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { oauthClient } from "@/lib/db/schema-pg";
import { requestLogger } from "@/lib/request-logger";
import { fetchPublicImage } from "@/lib/security/public-image";
import { clientIconLimiter, rateLimit } from "@/lib/security/redis-rate-limit";

export const runtime = "nodejs";

const MISS_HEADERS = { "Cache-Control": "public, max-age=300, s-maxage=300" };

export async function GET(request: NextRequest, context: { params: Promise<{ clientId: string }> }) {
  const limited = await rateLimit(request, clientIconLimiter);
  if (limited) return limited;

  const { clientId } = await context.params;
  const { log } = requestLogger(request, "oauth/client-icon");

  const [client] = await db
    .select({ icon: oauthClient.icon, disabled: oauthClient.disabled })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  if (!client?.icon || client.disabled) return new Response(null, { status: 404, headers: MISS_HEADERS });

  try {
    const { body, contentType } = await fetchPublicImage(client.icon);
    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    log.warn({ err, url: client.icon }, "failed to fetch oauth client icon");
    return new Response(null, { status: 404, headers: MISS_HEADERS });
  }
}
