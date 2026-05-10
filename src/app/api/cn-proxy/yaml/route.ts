import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const { CN_PROXY_HOST, CN_PROXY_PORT = "2560" } = process.env;

export async function GET() {
  if (!CN_PROXY_HOST) {
    return NextResponse.json({ error: "Proxy not configured" }, { status: 503 });
  }

  const yaml = `port: 7890
socks-port: 7891
mode: rule
log-level: info
proxies:
  - name: tomomai 查分器代理
    server: ${CN_PROXY_HOST}
    port: ${CN_PROXY_PORT}
    type: http
proxy-groups:
  - name: default
    type: select
    proxies:
      - tomomai 查分器代理
rules:
  - DOMAIN-SUFFIX,wahlap.com,default
  - MATCH,DIRECT
`;

  return new NextResponse(yaml, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="tomomai-proxy.yaml"',
    },
  });
}
