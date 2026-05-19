import { buildOpenApiDocument } from "@/lib/api/openapi";
import { resolveBaseUrl } from "@/lib/base-url";

export const dynamic = "force-dynamic";

export async function GET() {
  const baseUrl =
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? resolveBaseUrl();
  const doc = buildOpenApiDocument(baseUrl);
  return Response.json(doc, {
    headers: {
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}
