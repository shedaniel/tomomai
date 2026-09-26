import type { Region } from "@/lib/types";
import type { CanonicalGameId } from "./types";

interface GameSite {
  entryUrl: string;
  maintenance: {
    startHour: number;
    endHour: number;
    weekdayEndHours?: Partial<Record<number, number>>;
  };
}

const sites: Record<CanonicalGameId, Partial<Record<Region, GameSite>>> = {
  maimai: {
    intl: {
      entryUrl: "https://maimaidx-eng.com/maimai-mobile/",
      maintenance: { startHour: 1, endHour: 2, weekdayEndHours: { 3: 4 } },
    },
    jp: {
      entryUrl: "https://maimaidx.jp/maimai-mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
    cn: {
      entryUrl: "https://maimai.wahlap.com/maimai-mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
  },
  chunithm: {
    intl: {
      entryUrl: "https://chunithm-net-eng.com/mobile/",
      maintenance: { startHour: 4, endHour: 7 },
    },
    jp: {
      entryUrl: "https://new.chunithm-net.com/",
      maintenance: { startHour: 2, endHour: 7 },
    },
  },
};

export function getGameSite(game: CanonicalGameId, region: Region): GameSite | undefined {
  return sites[game][region];
}

export function gameBaseUrl(game: CanonicalGameId, region: Region): string {
  const site = getGameSite(game, region);
  if (!site) throw new Error(`Unsupported game site: ${game}/${region}`);
  return new URL(site.entryUrl).origin;
}
