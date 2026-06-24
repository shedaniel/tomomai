/**
 * @tomomai/render-token — shared binary token codec for apps/main ↔ apps/render.
 *
 * The token carries the full render payload (header metadata + score data),
 * HMAC-signed with RENDER_TOKEN_SECRET. apps/main mints; apps/render verifies.
 *
 * The compact binary format keeps the token URL-safe (~2KB for a B50 render),
 * so it can ride the existing 302 redirect without a callback or DB access in
 * render. See docs/render-token-v1.md for the wire format.
 */

export {
  DecodeError,
  EncodeError,
  VERSION,
  decodeMessage,
  encodeMessage,
} from "./codec";
export type {
  ChartRecord,
  DailyPlaysPayload,
  ExportImagePayload,
  LastCreditPayload,
  RenderHeader,
  RenderMessage,
  TrackRecord,
} from "./message";
export {
  isExpired,
  mintRenderToken,
  verifyRenderToken,
} from "./token";
export type { VerifyResult } from "./token";
export type {
  Difficulty,
  FullCombo,
  FullSync,
  NoteCounts,
  Region,
  Route,
  TitleType,
} from "./types";
