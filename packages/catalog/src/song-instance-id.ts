import type { Region } from "./types";

export const PARENT_PUBLIC_ID_LENGTH = 8;

const REGION_TO_LETTER = { jp: "j", intl: "i", cn: "c" } as const satisfies Record<Region, string>;
const LETTER_TO_REGION: Record<string, Region> = { j: "jp", i: "intl", c: "cn" };
const PARENT_ID_PATTERN = /^[A-Za-z0-9_-]{8}$/;

export function formatSongInstanceId(parentPublicId: string, region: Region, gameVersion: number): string {
  return `${parentPublicId}:${REGION_TO_LETTER[region]}${gameVersion}`;
}

export type ParsedSongId =
  | { kind: "parent"; parentPublicId: string }
  | { kind: "instance"; parentPublicId: string; region: Region; gameVersion: number };

export function parseSongId(id: string): ParsedSongId | null {
  const [parentPublicId, suffix, extra] = id.split(":");
  if (!PARENT_ID_PATTERN.test(parentPublicId) || extra !== undefined) return null;
  if (suffix === undefined) return { kind: "parent", parentPublicId };
  const region = LETTER_TO_REGION[suffix[0]];
  const versionPart = suffix.slice(1);
  if (!region || !/^(?:0|-?[1-9]\d*)$/.test(versionPart)) return null;
  const gameVersion = Number(versionPart);
  if (!Number.isInteger(gameVersion) || gameVersion < -32768 || gameVersion > 32767) return null;
  return { kind: "instance", parentPublicId, region, gameVersion };
}

export function parentPublicIdOf(id: string): string {
  return id.split(":", 1)[0];
}
