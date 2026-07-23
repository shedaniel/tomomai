import { SONG_CATALOG_CACHE_HEADERS } from "./cache-headers";

export function GET() {
  const r2BaseUrl = process.env.NEXT_PUBLIC_R2_URL;
  if (!r2BaseUrl) {
    throw new Error("NEXT_PUBLIC_R2_URL is required for the song catalog redirect");
  }

  return new Response(null, {
    status: 302,
    headers: {
      ...SONG_CATALOG_CACHE_HEADERS,
      Location: `${r2BaseUrl.replace(/\/$/, "")}/api/v1/songs`,
    },
  });
}
