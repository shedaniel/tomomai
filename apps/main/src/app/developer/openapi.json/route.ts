import { buildOpenApiDocument } from "@/lib/api/openapi";
import { resolveBaseUrl } from "@tomomai/server/base-url";
import { useDeveloperPortal } from "@/lib/flags";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await useDeveloperPortal())) {
    return new Response("Not Found", { status: 404 });
  }
  const baseUrl =
    process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? resolveBaseUrl();
  const doc = buildOpenApiDocument(baseUrl);
  return Response.json(doc, {
    headers: {
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}
