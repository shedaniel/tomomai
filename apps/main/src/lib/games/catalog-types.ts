import type { NoteCounts, Region } from "@/lib/types";
import type { CanonicalGameId } from "./types";

export type Pending<T> = T | { important: boolean; value: T };

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
