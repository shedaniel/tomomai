"use client";

import { useParams } from "next/navigation";
import { netBasePath } from "@/lib/net/routes";
import { safeDecodeURIComponent } from "@/lib/utils";

/** The signed-in player's /net base path, read from the route. */
export function useNetBase() {
  const params = useParams<{ username?: string; region?: string }>();
  return netBasePath(safeDecodeURIComponent(params.username ?? ""), params.region ?? "");
}
