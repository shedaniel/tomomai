import type { CatalogImagePolicy } from "@/server/services/catalog/ingestion/types";
import { otogeDbUrl } from "@/server/services/catalog/sources/otoge-db";

const COVER_PREFIX = otogeDbUrl("chunithm/jacket/");

export const chunithmImagePolicy: CatalogImagePolicy = {
  extractFilename: url => {
    if (!url.startsWith(COVER_PREFIX)) return null;
    const filename = url.slice(COVER_PREFIX.length);
    return /^[^/?#]+$/.test(filename) ? `chunithm/${filename}` : null;
  },
  preferUrl: () => false,
  staticAssets: [],
};
