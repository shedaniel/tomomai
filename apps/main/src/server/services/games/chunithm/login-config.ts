import "server-only";
import type { GameSiteRegion } from "@/lib/games/registry";
import type { SegaLoginConfig } from "../sega/login";

export const chunithmSegaLogin = {
  intl: {
    game: "chunithm",
    region: "intl",
    submitEncoding: "form",
  },
  jp: {
    game: "chunithm",
    region: "jp",
    // The JP sign-in form is on the site root, outside the mobile pages.
    entryPath: "/",
    submitPath: "submit/",
    accountListPath: "aimeList/",
    selectAccountPath: "aimeList/submit/",
    selectAccountMethod: "POST",
  },
} satisfies Record<GameSiteRegion<"chunithm">, SegaLoginConfig>;
