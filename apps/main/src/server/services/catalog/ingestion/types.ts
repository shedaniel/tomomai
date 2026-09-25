import type { NoteCounts, Region } from "@/lib/types";
import type { CanonicalGameId } from "@/lib/games/types";

export type Pending<T> = T | { important: boolean; value: T };

export function important<T>(value: T): Pending<T> {
  return { important: true, value };
}

export function value<T>(pending: Pending<T>): T {
  return !pending ? pending : typeof pending === "object" && "important" in pending ? pending.value : pending;
}

export function isImportant<T>(pending: Pending<T>): boolean {
  return !!pending && typeof pending === "object" && "important" in pending && pending.important;
}

export function unwrapUndefined<T>(pending: Pending<T> | undefined): Pending<NonNullable<T>> | undefined {
  const unwrapped = value(pending);
  if (unwrapped === null || unwrapped === undefined) return undefined;
  if (pending && typeof pending === "object" && "important" in pending && typeof pending.important === "boolean") {
    return { important: pending.important, value: unwrapped };
  }
  return unwrapped;
}

export function pendingValue<T>(pending: Pending<T> | undefined): T | undefined {
  return value(pending);
}

export type NoticeSink = {
  addDetail(detail: string): void;
  details: string[];
};

export type CatalogLogger = {
  child(bindings: Record<string, unknown>): CatalogLogger;
  trace(message: string, ...args: unknown[]): void;
  trace(fields: Record<string, unknown>, message?: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  debug(fields: Record<string, unknown>, message?: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  info(fields: Record<string, unknown>, message?: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  warn(fields: Record<string, unknown>, message?: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  error(fields: Record<string, unknown>, message?: string, ...args: unknown[]): void;
};

export type PendingChart = {
  game: CanonicalGameId;
  songName: string;
  chartType: number;
  difficulty: number;
  artist?: Pending<string>;
  cover?: Pending<string>;
  level?: Pending<string>;
  levelPrecise?: Pending<number>;
  genre?: Pending<string>;
  addedVersion?: Pending<number>;
  bpm?: Pending<number>;
  noteDesigner?: Pending<string>;
  noteCounts?: Pending<NoteCounts>;
  metadata?: Pending<Record<string, unknown>>;
  extras?: Record<string, unknown>;
};

export type CatalogFetchContext = {
  region: Region;
  version: number;
  cookies?: string;
  forceMode?: "default" | "only-modify" | "only-fallback";
  log: CatalogLogger;
  notice: NoticeSink;
};
