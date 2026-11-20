// The games whose International sites sign in through SEGA's Aime gateway, as the site's own game
// definitions describe them. A test on the site checks the two agree. Pure data, so the site can import it.

export const GAME_IDS = ["maimai", "chunithm"] as const;

/** The value of the gateway's `clal` cookie, which both games sign in with. */
export const CLAL = /^[A-Za-z0-9]{64}$/;
export type GameId = (typeof GAME_IDS)[number];

export type ScriptGame = {
  /** The site's brand, as the panel and its strings name it. */
  product: string;
  /** SEGA's member site, which a signed-in player lands on. */
  netName: string;
  netOrigin: string;
  netRoot: string;
  aime: { siteId: string; backUrl: string };
  /** The theme hue the panel is drawn in. */
  hue: number;
};

export const GAMES: Record<GameId, ScriptGame> = {
  maimai: {
    product: "tomomai",
    netName: "maimai DX NET",
    netOrigin: "https://maimaidx-eng.com",
    netRoot: "/maimai-mobile/",
    aime: { siteId: "maimaidxex", backUrl: "https://maimai.sega.com/" },
    hue: 0,
  },
  chunithm: {
    product: "tomochu",
    netName: "CHUNITHM-NET",
    netOrigin: "https://chunithm-net-eng.com",
    netRoot: "/mobile/",
    aime: { siteId: "chuniex", backUrl: "https://chunithm.sega.com/" },
    hue: 80,
  },
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && (GAME_IDS as readonly string[]).includes(value);
}
