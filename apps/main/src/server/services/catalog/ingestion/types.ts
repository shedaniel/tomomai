import type { NoteCounts, Region } from "@/lib/types";
import type { CanonicalGameId } from "@/lib/games/types";
import type { Logger } from "pino";

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

export type NoticeSink = {
  addDetail(detail: string): void;
  details: string[];
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
  log: Logger;
  notice: NoticeSink;
};
