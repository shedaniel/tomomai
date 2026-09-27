import "server-only";
import type { SegaLoginConfig } from "../sega/login";

export const chunithmMobilePaths = { jp: "/chuni-mobile/html/mobile/", intl: "/mobile/" } as const;

export const chunithmSegaLogin = {
  intl: {
    game: "chunithm",
    region: "intl",
    loginUrl: "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=chuniex&redirect_url=https://chunithm-net-eng.com/mobile/&back_url=https://chunithm.sega.com/",
    submitUrl: "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid",
    submitEncoding: "form",
  },
  jp: {
    game: "chunithm",
    region: "jp",
    submitPath: "/chuni-mobile/html/mobile/submit/",
    accountListPath: "/chuni-mobile/html/mobile/aimeList/",
    selectAccountPath: "/chuni-mobile/html/mobile/aimeList/submit/",
    selectAccountMethod: "POST",
  },
} satisfies Record<"intl" | "jp", SegaLoginConfig>;
