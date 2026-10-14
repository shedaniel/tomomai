import type { LoginMethod } from "./types";

export type DivingFishIdentifier = { kind: "username" | "qq"; value: string };

export type SegaAccountToken = { provider: "sega-account"; username: string; password: string; clal?: string };
export type SegaCookieToken = { provider: "sega-cookie"; clal: string };
export type CnCookiesToken = { provider: "cn-cookies"; cookies: string };
export type LxnsToken = { provider: "lxns"; accessToken: string; refreshToken: string; expiresAtMs: number; scope: string };
export type DivingFishToken = { provider: "divingfish"; account: DivingFishIdentifier };

export type ParsedToken = SegaAccountToken | SegaCookieToken | CnCookiesToken | LxnsToken | DivingFishToken;
export type TokenProvider = ParsedToken["provider"];
export type TokenOf<P extends TokenProvider> = Extract<ParsedToken, { provider: P }>;
export type SegaToken = TokenOf<"sega-account" | "sega-cookie">;

/** A token no provider can read. The error starts with "Invalid token format." so the player is asked for a new one. */
export type InvalidToken = { provider: null; error: string };

type TokenProviderFacts = {
  loginMethod: LoginMethod;
  /** Consumed by its first fetch, so a stored copy cannot start another. */
  singleUse?: true;
};

export const TOKEN_PROVIDERS: { readonly [P in TokenProvider]: TokenProviderFacts } = {
  "sega-account": { loginMethod: "sega-account" },
  "sega-cookie": { loginMethod: "sega-cookie" },
  "cn-cookies": { loginMethod: "maimai-cn", singleUse: true },
  lxns: { loginMethod: "maimai-cn" },
  divingfish: { loginMethod: "maimai-cn" },
};

const PREFIX = {
  "sega-account": "account://",
  "sega-cookie": "cookie://",
  "cn-cookies": "cn-cookies://",
  lxns: "lxns://",
  divingfish: "divingfish://",
} as const satisfies Record<TokenProvider, string>;

const SEPARATOR = ":://";

function invalid(detail: string): InvalidToken {
  return { provider: null, error: `Invalid token format. ${detail}` };
}

/** Reads a stored or submitted token. */
export function parseToken(token: string): ParsedToken | InvalidToken {
  const value = token.trim();
  if (value.startsWith(PREFIX["sega-cookie"])) return parseSegaCookie(value.slice(PREFIX["sega-cookie"].length));
  if (value.startsWith(PREFIX["sega-account"])) return parseSegaAccount(value.slice(PREFIX["sega-account"].length));
  if (value.startsWith(PREFIX["cn-cookies"])) {
    const cookies = value.slice(PREFIX["cn-cookies"].length);
    return cookies ? { provider: "cn-cookies", cookies } : invalid("The captured cookies are empty.");
  }
  if (value.startsWith(PREFIX.lxns)) return parseLxns(value.slice(PREFIX.lxns.length));
  if (value.startsWith(PREFIX.divingfish)) return parseDivingFish(value.slice(PREFIX.divingfish.length));
  return invalid("Please provide a new token.");
}

function parseSegaCookie(value: string): SegaCookieToken | InvalidToken {
  const clal = value.replace(/^clal=/, "").trim();
  if (!clal) return invalid("Token cannot be empty.");
  if (!/^[\x00-\x7F]*$/.test(clal)) return invalid("Please ensure you copied the clal cookie correctly (ASCII characters only).");
  return { provider: "sega-cookie", clal };
}

function parseSegaAccount(value: string): SegaAccountToken | InvalidToken {
  const parts = value.split(SEPARATOR);
  if (parts.length !== 2 && parts.length !== 3) {
    return invalid("Expected account://USERNAME:://PASSWORD or account://COOKIE:://USERNAME:://PASSWORD");
  }
  const [clal, username, password] = parts.length === 3 ? parts : [undefined, ...parts];
  if (!username || !password) return invalid("Username and password cannot be empty.");
  return { provider: "sega-account", username, password, ...(clal ? { clal } : {}) };
}

function parseLxns(value: string): LxnsToken | InvalidToken {
  const parts = value.split(SEPARATOR);
  const [accessToken, refreshToken, expiresAt, scope] = parts;
  const expiresAtMs = Number(expiresAt);
  if (parts.length !== 4 || !accessToken || !refreshToken || !Number.isFinite(expiresAtMs)) {
    return invalid("Expected lxns://<access>:://<refresh>:://<expiresAtMs>:://<scope>");
  }
  return { provider: "lxns", accessToken, refreshToken, expiresAtMs, scope };
}

function parseDivingFish(value: string): DivingFishToken | InvalidToken {
  const parts = value.split(SEPARATOR);
  const [kind, account] = parts;
  if (parts.length !== 2 || (kind !== "username" && kind !== "qq") || !account) {
    return invalid("Expected divingfish://<username|qq>:://<value>");
  }
  return { provider: "divingfish", account: { kind, value: account } };
}

export function isSegaToken(token: ParsedToken | InvalidToken): token is SegaToken {
  return token.provider === "sega-account" || token.provider === "sega-cookie";
}

export function formatSegaAccount(username: string, password: string, clal?: string): string {
  return PREFIX["sega-account"] + [...(clal ? [clal] : []), username, password].join(SEPARATOR);
}

/** A gateway session token from the `clal` cookie, given as its value or as `clal=value`. */
export function formatSegaCookie(clal: string): string {
  return PREFIX["sega-cookie"] + clal.trim().replace(/^clal=/, "");
}

export function formatCnCookies(cookies: string): string {
  return PREFIX["cn-cookies"] + cookies;
}

export function formatLxns({ accessToken, refreshToken, expiresAtMs, scope }: Omit<LxnsToken, "provider">): string {
  return PREFIX.lxns + [accessToken, refreshToken, expiresAtMs, scope].join(SEPARATOR);
}

export function formatDivingFish(account: DivingFishIdentifier): string {
  return PREFIX.divingfish + [account.kind, account.value].join(SEPARATOR);
}
