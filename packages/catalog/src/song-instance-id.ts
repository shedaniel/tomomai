import type { Region } from "./types";

// Public identifier scheme for charts and their instances:
//
//   abcd            -> the chart (parent_song.publicId, a nanoid)
//   abcd:j11        -> the chart's instance in jp @ gameVersion 11
//   abcd:i-1        -> (spec allows negative versions) intl @ version -1
//
// The instance id is COMPUTED, never stored: it is a pure encoding of the
// child's natural key (parentId, region, gameVersion), all of which are
// immutable for a given row. ':' is not in the nanoid alphabet, so parsing
// is unambiguous, and truncating at ':' always yields the chart id.

const REGION_TO_LETTER = { jp: "j", intl: "i", cn: "c" } as const satisfies Record<Region, string>;
const LETTER_TO_REGION: Record<string, Region> = { j: "jp", i: "intl", c: "cn" };

export function formatSongInstanceId(parentPublicId: string, region: Region, gameVersion: number): string {
  return `${parentPublicId}:${REGION_TO_LETTER[region]}${gameVersion}`;
}

export type ParsedSongId =
  | { kind: "parent"; parentPublicId: string }
  | { kind: "instance"; parentPublicId: string; region: Region; gameVersion: number };

/**
 * Parse a public song id in either form. A bare nanoid addresses the chart;
 * `<nanoid>:<regionLetter><version>` addresses one instance. Returns null
 * for malformed ids.
 */
export function parseSongId(id: string): ParsedSongId | null {
  const sep = id.indexOf(":");
  if (sep === -1) {
    return id.length > 0 ? { kind: "parent", parentPublicId: id } : null;
  }

  const parentPublicId = id.slice(0, sep);
  const suffix = id.slice(sep + 1);
  if (parentPublicId.length === 0 || suffix.length < 2) return null;

  const region = LETTER_TO_REGION[suffix[0]];
  if (!region) return null;

  const versionPart = suffix.slice(1);
  if (!/^-?\d+$/.test(versionPart)) return null;

  return { kind: "instance", parentPublicId, region, gameVersion: parseInt(versionPart, 10) };
}

/** The chart id for either id form (truncates an instance id at ':'). */
export function parentPublicIdOf(id: string): string {
  const sep = id.indexOf(":");
  return sep === -1 ? id : id.slice(0, sep);
}
