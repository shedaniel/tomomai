import type { CatalogImagePolicy } from "../image-policy";

const COVER_PATTERN = /^https:\/\/raw\.githubusercontent\.com\/zvuc\/otoge-db\/main\/chunithm\/jacket\/([^/?#]+)$/;

export const chunithmImagePolicy: CatalogImagePolicy = {
  extractFilename: url => {
    const match = url.match(COVER_PATTERN);
    return match ? `chunithm/${match[1]}` : null;
  },
  preferUrl: () => false,
  staticAssets: [],
};
