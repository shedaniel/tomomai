import "server-only";
import type { SegaLoginConfig } from "../sega/login";

export const maimaiSegaLogin = {
  intl: {
    game: "maimai",
    region: "intl",
  },
  jp: {
    game: "maimai",
    region: "jp",
    entryPath: "",
    submitPath: "submit/",
    accountListPath: "aimeList/",
    selectAccountPath: "aimeList/submit/?idx=0",
  },
} satisfies Record<"intl" | "jp", SegaLoginConfig>;
