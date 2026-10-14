import { lookup } from "node:dns";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { Agent, fetch } from "undici";

const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

/** Only plain public unicast; ipaddr.js unwraps IPv4-mapped IPv6 before classifying. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 0) return false;
  return ipaddr.process(address).range() === "unicast";
}

// Checking at connect time, not before the request, closes the DNS-rebinding gap.
const agent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (err, addresses) => {
        if (err) return callback(err, []);
        const list = addresses as { address: string; family: number }[];
        if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
          return callback(new Error(`refusing non-public address for ${hostname}`), []);
        }
        if (options.all) return callback(null, list);
        callback(null, list[0]!.address, list[0]!.family);
      });
    },
  },
});

type Sniffed = "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/avif";

/** SVG is never accepted: served from our origin it could run script. */
function sniff(b: Uint8Array): Sniffed | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

function parseHttps(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    // IP-literal hosts skip DNS, so the connect-time check alone wouldn't see them.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && !isPublicAddress(host)) return null;
    return url;
  } catch {
    return null;
  }
}

export type PublicImage = { body: Uint8Array<ArrayBuffer>; contentType: Sniffed };

/**
 * Fetches a raster image from a public https URL for re-serving from our own
 * origin. Rejects private networks, oversized bodies and anything that is not
 * a PNG, JPEG, GIF, WebP or AVIF by its bytes.
 */
export async function fetchPublicImage(raw: string): Promise<PublicImage> {
  let url = parseHttps(raw);
  if (!url) throw new Error("not a public https URL");

  for (let hop = 0; ; hop++) {
    const res = await fetch(url, {
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new Error("too many redirects");
      url = parseHttps(new URL(location, url).toString());
      if (!url) throw new Error("redirect to a non-public URL");
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`upstream responded ${res.status}`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("image too large");

    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) throw new Error("image too large");
      chunks.push(chunk);
    }
    const body = new Uint8Array(new ArrayBuffer(size));
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const contentType = sniff(body);
    if (!contentType) throw new Error("not a supported raster image");
    return { body, contentType };
  }
}
