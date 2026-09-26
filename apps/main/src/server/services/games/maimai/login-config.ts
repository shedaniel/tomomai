import "server-only";
import type { SegaLoginConfig } from "../sega/login";

export const maimaiSegaLogin = {
  intl: {
    game: "maimai",
    region: "intl",
    loginUrl: "https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/",
    submitUrl: "https://lng-tgk-aime-gw.am-all.net/common_auth/login/sid",
  },
  jp: {
    game: "maimai",
    region: "jp",
    submitPath: "submit/",
    accountListPath: "aimeList/",
    selectAccountPath: "aimeList/submit/?idx=0",
  },
} satisfies Record<"intl" | "jp", SegaLoginConfig>;
