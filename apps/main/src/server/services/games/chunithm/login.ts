import "server-only";
import type { GameSiteRegion } from "@/lib/games/registry";
import { requireGameSite } from "@/lib/games/sites";
import type { Region } from "@/lib/types";
import { openSegaSession, type SegaLoginConfig } from "../sega/login";

export const chunithmSegaLogin = {
  intl: { game: "chunithm", region: "intl", kind: "aime-gateway" },
  jp: {
    game: "chunithm",
    region: "jp",
    kind: "sega-id-site",
    // The JP sign-in form is on the site root, outside the mobile pages.
    entryPath: "/",
    formToken: "input:token",
    cardSelection: { method: "POST" },
  },
} satisfies Record<GameSiteRegion<"chunithm">, SegaLoginConfig>;

export async function loginAndGetCookies(region: Region, token: string, userId: string | null = null, signal?: AbortSignal): Promise<string> {
  requireGameSite("chunithm", region);
  return (await openSegaSession(chunithmSegaLogin[region], userId, token, signal)).cookies;
}
