import type { MetadataRoute } from "next";
import { resolveBaseUrl } from "@/lib/base-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        // Server API surface — never useful to a crawler.
        "/api/",
        "/_next/image",
        "/_next/static/",
        "/_next/data/",
      ],
    },
    sitemap: `${resolveBaseUrl()}/sitemap.xml`,
  };
}
