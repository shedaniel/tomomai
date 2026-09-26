import type { CatalogImagePolicy } from "../image-policy";

export const chunithmImagePolicy: CatalogImagePolicy = {
  // TODO: Add CHUNITHM cover rehosting when its image policy is supported.
  extractFilename: () => null,
  preferUrl: () => false,
  staticAssets: [],
};
