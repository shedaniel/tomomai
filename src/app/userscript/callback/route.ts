import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // The userscript drives the token exchange itself (PKCE), so the callback's
  // only job is to hand the authorization code back to the opener window.
  const result: Record<string, unknown> = error || !code
    ? { error: error ?? "missing_code", state }
    : { code, state };

  const payload = JSON.stringify(result);
  const html = `<!DOCTYPE html>
<html>
<head><title>tomomai</title></head>
<body>
<script>
(function(){
  var result=${payload};
  if(window.opener){window.opener.postMessage(Object.assign({source:'tomomai-userscript'},result),'*');}
  window.close();
})();
</script>
<p style="font-family:sans-serif;text-align:center;margin-top:40px">Closing…</p>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
