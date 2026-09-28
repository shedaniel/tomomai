import type { CatalogImagePolicy } from "@/server/services/catalog/image-policy";
import { OTOGE_DB_CHUNITHM_ROOT } from "./sources/otoge-db";

const COVER_PREFIX = `${OTOGE_DB_CHUNITHM_ROOT}/jacket/`;

export const chunithmImagePolicy: CatalogImagePolicy = {
  extractFilename: url => {
    if (!url.startsWith(COVER_PREFIX)) return null;
    const filename = url.slice(COVER_PREFIX.length);
    return /^[^/?#]+$/.test(filename) ? `chunithm/${filename}` : null;
  },
  preferUrl: () => false,
  staticAssets: [],
};
