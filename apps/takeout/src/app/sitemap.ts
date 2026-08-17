import type { MetadataRoute } from "next";
import { resolveBaseUrl } from "@/lib/base-url";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${resolveBaseUrl()}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];
}
