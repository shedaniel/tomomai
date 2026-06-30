/**
 * Client-side audio format negotiation for the v2 `/api/audio` route.
 *
 * The server can encode the clip as either Opus-in-WebM (small, efficient)
 * or AAC-in-fragmented-MP4 (universal). Safari/WebKit — including every
 * browser on iOS — does not reliably decode Opus-in-WebM via `<audio>`, so
 * playback silently fails there. We pick the best container the current
 * browser can actually play and pass it to the route as `?fmt=`.
 */

export type AudioFormat = "webm" | "mp4";

let cached: AudioFormat | null = null;

/**
 * Best supported clip format for this browser. Prefers `webm` (Opus) when the
 * browser reports it can play it, otherwise falls back to `mp4` (AAC), which
 * Safari and every other modern browser support. SSR-safe: returns `webm` on
 * the server (the value is only consumed client-side after mount).
 */
export function pickAudioFormat(): AudioFormat {
  if (cached) return cached;
  if (typeof document === "undefined") return "webm";
  const probe = document.createElement("audio");
  const webmOpus = probe.canPlayType('audio/webm; codecs="opus"');
  // `canPlayType` returns "probably" | "maybe" | "". Safari returns "" for
  // webm/opus; Chrome/Firefox return "probably".
  cached = webmOpus === "probably" || webmOpus === "maybe" ? "webm" : "mp4";
  return cached;
}

/**
 * Append the negotiated `fmt` to a v2 audio URL. Leaves non-route URLs (the
 * direct Apple preview used by v1 puzzles and the reveal button) untouched.
 */
export function withAudioFormat(url: string): string {
  if (!url.startsWith("/api/audio/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}fmt=${pickAudioFormat()}`;
}
