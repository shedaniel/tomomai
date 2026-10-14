import type { TRPC_ERROR_CODE_KEY } from "@trpc/server";

/** How every transport answers a fetch that was refused before its session started. */
export const FETCH_START_ERROR_STATUS = {
  NO_TOKEN_FOUND: { http: 412, trpc: "PRECONDITION_FAILED" },
  TOKEN_UNREADABLE: { http: 412, trpc: "PRECONDITION_FAILED" },
  CN_COOKIES_SINGLE_USE: { http: 412, trpc: "PRECONDITION_FAILED" },
  NO_USE_ALBUMS_SETTINGS: { http: 412, trpc: "PRECONDITION_FAILED" },
  MAINTENANCE: { http: 503, trpc: "SERVICE_UNAVAILABLE" },
  FETCH_IN_PROGRESS: { http: 409, trpc: "CONFLICT" },
  RATE_LIMITED: { http: 429, trpc: "TOO_MANY_REQUESTS" },
} as const satisfies Record<string, { http: number; trpc: TRPC_ERROR_CODE_KEY }>;

export type FetchStartErrorCode = keyof typeof FETCH_START_ERROR_STATUS;

/** Codes a running fetch stores on its failed session. */
const SESSION_FAILURE_CODES = ["SUBSCRIPTION_REQUIRED"] as const;

export type FetchErrorCode = FetchStartErrorCode | (typeof SESSION_FAILURE_CODES)[number];

/** Clients only receive the message, so the code travels as its prefix. */
export function formatFetchError(code: FetchErrorCode, detail: string): string {
  return `${code}: ${detail}`;
}

export function parseFetchErrorCode(message: string): FetchErrorCode | null {
  const code = /^([A-Z_]+): /.exec(message)?.[1];
  if (code === undefined) return null;
  if (code in FETCH_START_ERROR_STATUS) return code as FetchStartErrorCode;
  return SESSION_FAILURE_CODES.find(known => known === code) ?? null;
}

/** The message people read, without the code prefix that clients branch on. */
export function fetchErrorDetail(message: string): string {
  const code = parseFetchErrorCode(message);
  return code === null ? message : message.slice(code.length + 2);
}
