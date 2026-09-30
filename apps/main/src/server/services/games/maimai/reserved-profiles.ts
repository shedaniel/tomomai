import "server-only";
import type { Difficulty } from "@/lib/games/maimai/types";

interface ReservedProfile {
  userId: string;
  username: string;
  displayName: string;
  maxDifficulty: Difficulty;
}

export const MAIMAI_RESERVED_PROFILES: Readonly<Record<string, ReservedProfile>> = {
  max: {
    userId: "reserved-max",
    username: "max",
    displayName: "\uff4d\uff41\uff58\uff52\uff41\uff54\uff49\uff4e\uff47", // ｍａｘｒａｔｉｎｇ
    maxDifficulty: "remaster",
  },
  maxbas: {
    userId: "reserved-maxbas",
    username: "maxbas",
    displayName: "ｍａｘｂａｓ", // ｍａｘｂａｓ
    maxDifficulty: "basic",
  },
  maxadv: {
    userId: "reserved-maxadv",
    username: "maxadv",
    displayName: "ｍａｘａｄｖ", // ｍａｘａｄｖ
    maxDifficulty: "advanced",
  },
  maxexp: {
    userId: "reserved-maxexp",
    username: "maxexp",
    displayName: "ｍａｘｅｘｐ", // ｍａｘｅｘｐ
    maxDifficulty: "expert",
  },
  maxmas: {
    userId: "reserved-maxmas",
    username: "maxmas",
    displayName: "ｍａｘｍａｓ", // ｍａｘｍａｓ
    maxDifficulty: "master",
  },
  maxrem: {
    userId: "reserved-maxrem",
    username: "maxrem",
    displayName: "ｍａｘｒｅｍ", // ｍａｘｒｅｍ
    maxDifficulty: "remaster",
  },
};

/** The demo profiles' usernames, which no account may take. */
export const MAIMAI_RESERVED_USERNAMES: ReadonlySet<string> = new Set(Object.keys(MAIMAI_RESERVED_PROFILES));
