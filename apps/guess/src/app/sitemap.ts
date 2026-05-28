import type { MetadataRoute } from "next";
import { previousJstDateSlug } from "@/lib/date-slug";
import { resolveBaseUrl } from "@/lib/base-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = resolveBaseUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];
  // Previous 3 days — each is a stable past puzzle (content never changes
  // after the JST date passes), so changeFrequency is `never`.
  for (let i = 1; i <= 3; i++) {
    entries.push({
      url: `${base}/${previousJstDateSlug(i)}`,
      lastModified: now,
      changeFrequency: "never",
      priority: 0.5,
    });
  }
  return entries;
}
