export const NET_PAGE_IDS = [
  "home", "rating", "history", "options", "serial",
  "playData", "stampCard", "album",
  "friends", "friendSearch", "circle",
  "shop",
  "records", "songs", "dan", "worldStats",
  "area", "eventArea", "season",
  "icon", "plates", "frame", "title", "partner", "secrets",
  "ranking", "ratingRanking",
] as const;
export type NetPageId = (typeof NET_PAGE_IDS)[number];

export const NET_SECTION_IDS = ["home", "playData", "friends", "shop", "records", "event", "collection", "ranking"] as const;
export type NetSectionId = (typeof NET_SECTION_IDS)[number];

/**
 * Path segment under /net/[username]/[region], and the menu tile each page lights up. Detail pages live one
 * level deeper (records/<id>, songs/<id>) and light up their list page's tile and tab.
 */
export const NET_PAGES: Readonly<Record<NetPageId, { segment: string; section: NetSectionId }>> = {
  home: { segment: "", section: "home" },
  rating: { segment: "rating", section: "home" },
  history: { segment: "history", section: "home" },
  options: { segment: "options", section: "home" },
  serial: { segment: "serial", section: "shop" },
  playData: { segment: "play-data", section: "playData" },
  stampCard: { segment: "stamp-card", section: "playData" },
  album: { segment: "album", section: "playData" },
  friends: { segment: "friends", section: "friends" },
  friendSearch: { segment: "friend-search", section: "friends" },
  circle: { segment: "circle", section: "friends" },
  shop: { segment: "shop", section: "shop" },
  records: { segment: "records", section: "records" },
  songs: { segment: "songs", section: "records" },
  dan: { segment: "dan", section: "records" },
  worldStats: { segment: "world-stats", section: "records" },
  area: { segment: "area", section: "event" },
  eventArea: { segment: "event-area", section: "event" },
  season: { segment: "season", section: "event" },
  icon: { segment: "icon", section: "collection" },
  plates: { segment: "plates", section: "collection" },
  frame: { segment: "frame", section: "collection" },
  title: { segment: "title", section: "collection" },
  partner: { segment: "partner", section: "collection" },
  secrets: { segment: "secrets", section: "collection" },
  ranking: { segment: "ranking", section: "ranking" },
  ratingRanking: { segment: "rating-ranking", section: "ranking" },
};

export type NetTile = {
  id: NetSectionId;
  page: NetPageId;
  /** Shows the STD badge until a course is "bought". The page itself still opens. */
  locked?: boolean;
};

export const NET_TILES: readonly NetTile[] = [
  { id: "home", page: "home" },
  { id: "playData", page: "playData" },
  { id: "friends", page: "friends", locked: true },
  { id: "shop", page: "shop" },
  { id: "records", page: "records" },
  { id: "event", page: "area" },
  { id: "collection", page: "icon" },
  { id: "ranking", page: "ranking", locked: true },
];

export type NetSubTab = { labelKey: string; page: NetPageId };

export const NET_SUB_TABS: Readonly<Record<NetSectionId, readonly NetSubTab[]>> = {
  home: [
    { labelKey: "home", page: "home" },
    { labelKey: "rating", page: "rating" },
    { labelKey: "history", page: "history" },
  ],
  playData: [
    { labelKey: "playData", page: "playData" },
    { labelKey: "stampCard", page: "stampCard" },
    { labelKey: "album", page: "album" },
  ],
  friends: [
    { labelKey: "friends", page: "friends" },
    { labelKey: "friendSearch", page: "friendSearch" },
    { labelKey: "circle", page: "circle" },
  ],
  shop: [
    { labelKey: "standardCourse", page: "shop" },
    { labelKey: "serial", page: "serial" },
  ],
  records: [
    { labelKey: "gameRecord", page: "records" },
    { labelKey: "songScore", page: "songs" },
    { labelKey: "dan", page: "dan" },
    { labelKey: "worldStats", page: "worldStats" },
  ],
  event: [
    { labelKey: "area", page: "area" },
    { labelKey: "eventArea", page: "eventArea" },
    { labelKey: "season", page: "season" },
  ],
  collection: [
    { labelKey: "icon", page: "icon" },
    { labelKey: "namePlate", page: "plates" },
    { labelKey: "frame", page: "frame" },
    { labelKey: "title", page: "title" },
    { labelKey: "partner", page: "partner" },
  ],
  ranking: [
    { labelKey: "songRanking", page: "ranking" },
    { labelKey: "ratingRanking", page: "ratingRanking" },
  ],
};

export function netBasePath(username: string, region: string): string {
  return `/net/${encodeURIComponent(username)}/${region}`;
}

/** A recent play's detail page, by its stored recent-play id. */
export function netRecordDetailPath(base: string, recentId: string | number | bigint): string {
  return `${base}/records/${encodeURIComponent(String(recentId))}`;
}

/** A song's page, by the song's public id. */
export function netSongDetailPath(base: string, songId: string): string {
  return `${base}/songs/${encodeURIComponent(songId)}`;
}

export function netProfilePath(username: string, region: string): string {
  return `/profile/${encodeURIComponent(username)}/${region}`;
}

export function netPagePath(base: string, page: NetPageId): string {
  const { segment } = NET_PAGES[page];
  return segment ? `${base}/${segment}` : base;
}

/** The page a pathname shows, given the player's base path. The pathname may carry a locale prefix. */
export function netPageFromPathname(pathname: string, base: string): NetPageId {
  const index = pathname.indexOf(base);
  const rest = index === -1 ? "" : pathname.slice(index + base.length).replace(/^\/+|\/+$/g, "");
  const segment = rest.split("/")[0] ?? "";
  return NET_PAGE_IDS.find(id => NET_PAGES[id].segment === segment) ?? "home";
}
