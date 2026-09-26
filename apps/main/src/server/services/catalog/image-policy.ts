export type CatalogImagePolicy = {
  extractFilename: (url: string) => string | null;
  preferUrl: (candidate: string, existing: string) => boolean;
  staticAssets: readonly { url: string; basename: string }[];
};
