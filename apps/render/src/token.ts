/**
 * Token verification for the render service.
 *
 * Re-exports the verify/decode from @tomomai/render-token. apps/main does ALL
 * data prep and mints the token; this side verifies the HMAC signature and
 * decodes the binary payload. See docs/render-token-v1.md for the wire format.
 *
 * The token carries the full render data (header + scores), HMAC-signed with
 * RENDER_TOKEN_SECRET. Tamper-proof — any byte flip breaks the signature.
 */

export {
  isExpired,
  verifyRenderToken,
  type RenderMessage,
  type VerifyResult,
} from "@tomomai/render-token";
