// A song ID names a parent song (`Ab3xK9pQ`) or one instance of it in a region and game version (`Ab3xK9pQ:j14`).

export const PARENT_PUBLIC_ID_LENGTH = 8;

const REGION_LETTERS = { jp: "j", intl: "i", cn: "c" } as const;
export type SongIdRegion = keyof typeof REGION_LETTERS;
const LETTER_REGIONS = new Map<string, SongIdRegion>((Object.keys(REGION_LETTERS) as SongIdRegion[]).map(region => [REGION_LETTERS[region], region]));

const PARENT_ID = `[A-Za-z0-9_-]{${PARENT_PUBLIC_ID_LENGTH}}`;
const GAME_VERSION = "(?:0|-?[1-9]\\d*)";
const GAME_VERSION_PATTERN = new RegExp(`^${GAME_VERSION}$`);
export const PARENT_PUBLIC_ID_PATTERN = new RegExp(`^${PARENT_ID}$`);
export const SONG_INSTANCE_ID_PATTERN = new RegExp(`^${PARENT_ID}:[${Object.values(REGION_LETTERS).join("")}]${GAME_VERSION}$`);

export function formatSongInstanceId(parentPublicId: string, region: SongIdRegion, gameVersion: number): string {
  return `${parentPublicId}:${REGION_LETTERS[region]}${gameVersion}`;
}

export type ParsedSongId =
  | { kind: "parent"; parentPublicId: string }
  | { kind: "instance"; parentPublicId: string; region: SongIdRegion; gameVersion: number };

/** Null for anything but a parent or instance ID, including a game version outside smallint range. */
export function parseSongId(id: string): ParsedSongId | null {
  const [parentPublicId, suffix, extra] = id.split(":");
  if (!PARENT_PUBLIC_ID_PATTERN.test(parentPublicId) || extra !== undefined) return null;
  if (suffix === undefined) return { kind: "parent", parentPublicId };
  const region = LETTER_REGIONS.get(suffix[0]);
  const versionPart = suffix.slice(1);
  if (!region || !GAME_VERSION_PATTERN.test(versionPart)) return null;
  const gameVersion = Number(versionPart);
  if (!Number.isInteger(gameVersion) || gameVersion < -32768 || gameVersion > 32767) return null;
  return { kind: "instance", parentPublicId, region, gameVersion };
}

export function parentPublicIdOf(id: string): string {
  return id.split(":", 1)[0];
}
