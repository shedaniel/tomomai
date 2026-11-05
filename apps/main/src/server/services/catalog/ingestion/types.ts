import type { Region } from "@/lib/games/ids";
import type { Logger } from "pino";
import type { GameSiteSession } from "@/server/services/games/sega/http";
import type { FetcherMode } from "./merge";
import type { CatalogChart, CatalogChartIdentity } from "./schema";

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

export type NoticeSink = {
  addDetail(detail: string): void;
  details: string[];
};

type CatalogChartData = Omit<CatalogChart, keyof CatalogChartIdentity>;

/** A chart while sources collect it. Its identity is known, and each other field may be missing or marked important. */
export type PendingChart = CatalogChartIdentity & { [K in keyof CatalogChartData]?: Pending<NonNullable<CatalogChartData[K]>> } & {
  extras?: Record<string, unknown>;
};

/** A chart as a source emits it. `mode` overrides the source's merge mode for this chart only. */
export type SourceChart = PendingChart & { mode?: FetcherMode };

export type CatalogImagePolicy = {
  /** The storage name of a source cover URL, or null for a URL that is not a source cover. */
  extractFilename: (url: string) => string | null;
  preferUrl: (candidate: string, existing: string) => boolean;
  staticAssets: readonly { url: string; basename: string }[];
  /** The site cannot load the source covers, so a catalog write must point at hosted copies. */
  requireHosting: boolean;
};

export type CatalogCollectContext = {
  region: Region;
  version: number;
  /** The source login's session. Every stage that reads the game site shares it, so cookies it refreshes carry over. */
  session: GameSiteSession;
  log: Logger;
};

export type CatalogFetchContext = CatalogCollectContext & {
  notice: NoticeSink;
};
