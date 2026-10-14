import { timingSafeEqual } from "node:crypto";

export type AdminTokenCheck = "ok" | "missing" | "unconfigured" | "invalid";

/** Checks a bearer `Authorization` header against ADMIN_UPDATE_TOKEN. */
export function checkAdminToken(authorization: string | null): AdminTokenCheck {
  const token = authorization?.replace("Bearer ", "");
  if (!token) return "missing";
  const expected = process.env.ADMIN_UPDATE_TOKEN;
  if (!expected) return "unconfigured";
  const provided = Buffer.from(token);
  const secret = Buffer.from(expected);
  return provided.length === secret.length && timingSafeEqual(provided, secret) ? "ok" : "invalid";
}
