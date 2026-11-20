import { NextRequest } from "next/server";
import { useUserscriptFetch } from "@/lib/flags";
import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";

// The userscript opens the sign-in from the SEGA gateway page, where it reads the cookie, and exchanges
// the code itself with its PKCE verifier. This page only hands the code back to that window.
export async function GET(request: NextRequest) {
  if (!(await useUserscriptFetch())) return new Response("Not Found", { status: 404 });
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const result: Record<string, unknown> = error || !code
    ? { error: error ?? "missing_code", state }
    : { code, state };

  // A fixed target origin, so no other page that opens this one can read the code.
  const payload = JSON.stringify({ source: "tomomai-userscript", ...result }).replace(/</g, "\\u003c");
  const origin = JSON.stringify(SEGA_AIME_GATEWAY.origin);
  const html = `<!DOCTYPE html>
<html>
<head><meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>tomomai</title></head>
<body>
<script>
(function(){
  if(window.opener){window.opener.postMessage(${payload},${origin});}
  window.close();
})();
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:40px">You can close this window.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
