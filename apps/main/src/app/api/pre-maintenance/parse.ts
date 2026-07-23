export interface PreMaintenanceBannerData {
  title: string;
  description: string;
  raw: string;
}

export function parsePreMaintenanceBanner(value: unknown): PreMaintenanceBannerData | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const parts = value.split("||");
  if (parts.length < 2) {
    return null;
  }

  return {
    title: parts[0].trim(),
    description: parts.slice(1).join("||").trim(),
    raw: value,
  };
}
