import { getAvailableVersions } from "@/lib/metadata";
import type { Region } from "@/lib/types";

export const CATALOG_R2_PREFIX = "api/v1/catalog-parent-v1";

export function isCatalogVersion(region: Region, gameVersion: number): boolean {
  return getAvailableVersions(region).some((version) => version.id === gameVersion);
}

export function songCatalogKey(region: Region, gameVersion: number): string {
  return `${CATALOG_R2_PREFIX}/songs/${region}/${gameVersion}`;
}

export function catalogUrl(key: string): string {
  const base = process.env.CATALOG_URL ?? "https://cdn.tomomai.lol";
  return `${base.replace(/\/$/, "")}/${key}`;
}
