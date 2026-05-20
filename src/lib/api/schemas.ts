import { z } from "zod";
import { getEnabledRegions } from "@/lib/enabled-regions";

/**
 * Shared Zod schemas used by `/api/v1/**` route specs. These are the
 * canonical descriptions of the public API shape — the OpenAPI document and
 * the Developer Center docs both consume these.
 *
 * Keep field-level `.describe(...)` calls populated; they surface as docs in
 * both the OpenAPI schema and the on-site param/response tables.
 */

export const regionSchema = z
  .enum(["intl", "jp", "cn"])
  .describe("Game region to read data from.")
  .refine((r) => getEnabledRegions().includes(r), {
    message: `Region is not enabled on this deployment. Enabled regions: ${getEnabledRegions().join(", ")}`,
  });

export const querySchemas = {
  regionRequired: z.object({
    region: regionSchema,
  }),
  paginated: z.object({
    region: regionSchema,
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Page size. Defaults vary by endpoint (recents: 50, albums: 20). Max 100."),
    offset: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Number of items to skip from the start. Defaults to 0."),
  }),
  plates: z.object({
    region: regionSchema,
    version: z.string().describe("Game version number to filter songs by (e.g. \"24000\")."),
    difficulty: z
      .enum(["basic", "advanced", "expert", "master"])
      .describe("Chart difficulty to evaluate plate completion against."),
    plateType: z
      .enum(["kiwami", "shou", "shin", "maimai"])
      .describe("Which plate to evaluate: kiwami (clear), shou (SSS), shin (AP), maimai (FDX)."),
  }),
};

export const plateEntry = z.object({
  songId: z.string(),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable(),
  difficulty: z.string(),
  levelPrecise: z.number(),
  type: z.string(),
  achievement: z.number().int(),
  fc: z.string(),
  fs: z.string(),
  dxScore: z.number().int(),
});

export const profileSettings = z.object({
  publishProfile: z.boolean(),
  profileMainRegion: regionSchema,
  profileShowAllScores: z.boolean(),
  profileShowScoreDetails: z.boolean(),
  profileShowPlates: z.boolean(),
  profileShowPlayCounts: z.boolean(),
  profileShowEvents: z.boolean(),
  profileShowInSearch: z.boolean(),
});

export const fetchStatus = z.object({
  id: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  startedAt: z.string().describe("ISO 8601 timestamp."),
  completedAt: z.string().nullable().describe("ISO 8601 timestamp, null while pending."),
  errorMessage: z.string().nullable(),
  statusStates: z.string().nullable().describe("Comma-separated progress markers; null if not started."),
  notFoundScores: z
    .array(
      z.object({
        songName: z.string(),
        difficulty: z.string(),
        musicType: z.string(),
      }),
    )
    .nullable(),
});

export const fetchStartResult = z.object({
  sessionId: z.string(),
  status: z.literal("pending"),
});

export const successResponse = z.object({ success: z.literal(true) });

export const songCatalogueEntry = z.object({
  songId: z.string().describe("Public song ID (21-char nanoid)."),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable().describe("Cover image URL, may be null."),
  type: z.enum(["std", "dx", "utage"]).describe("Chart type."),
  genre: z.string(),
  difficulty: z.enum(["basic", "advanced", "expert", "master", "remaster", "utage"]),
  level: z.string().describe("Displayed level, e.g. \"14+\"."),
  levelPrecise: z.number().describe("Decimal level value, e.g. 14.7."),
  region: regionSchema,
  gameVersion: z.number().int(),
  addedVersion: z.number().int(),
  bpm: z.number().nullable(),
});

export const songDetail = songCatalogueEntry.extend({
  noteDesigner: z.string().nullable(),
  noteCounts: z.object({
    tap: z.number().int().nullable(),
    hold: z.number().int().nullable(),
    slide: z.number().int().nullable(),
    touch: z.number().int().nullable(),
    break: z.number().int().nullable(),
  }),
});

export const snapshotMetadata = z.object({
  id: z.string().describe("Public snapshot ID."),
  fetchedAt: z.string().describe("ISO 8601 timestamp."),
  rating: z.number().int(),
  displayName: z.string().nullable(),
  gameVersion: z.number().int(),
  courseRankUrl: z.string().nullable(),
  classRankUrl: z.string().nullable(),
  stars: z.number().int().nullable(),
  versionPlayCount: z.number().int().nullable(),
  totalPlayCount: z.number().int().nullable(),
});

const songScore = z.object({
  songId: z.string(),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable(),
  difficulty: z.string(),
  level: z.string(),
  levelPrecise: z.number(),
  type: z.string(),
  genre: z.string(),
  addedVersion: z.number().int(),
  achievement: z.number().int(),
  dxScore: z.number().int(),
  fc: z.string(),
  fs: z.string(),
  rating: z.number().int().optional().describe("Only present on B50-restricted responses."),
});

export const snapshotDetail = snapshotMetadata.extend({
  iconUrl: z
    .string()
    .nullable()
    .describe("Profile icon URL. Requires `snapshot:*:icon:read`, otherwise null."),
  songs: z
    .array(songScore)
    .nullable()
    .describe("Song scores. Null if neither `…songs:read` nor `…songs:b50:read` is granted."),
  events: z
    .array(
      z.object({
        eventType: z.string(),
        name: z.string(),
        currentDistance: z.number().int().nullable(),
        nextRewardDistance: z.number().int().nullable(),
        state: z.string(),
        imageUrl: z.string().nullable(),
        eventPeriodStart: z.string().nullable(),
        eventPeriodEnd: z.string().nullable(),
      }),
    )
    .nullable()
    .describe("Event progress. Null if `…events:read` is not granted."),
});

const noteBreakdown = z.object({
  cPerfect: z.number().int().nullable(),
  perfect: z.number().int().nullable(),
  great: z.number().int().nullable(),
  good: z.number().int().nullable(),
  miss: z.number().int().nullable(),
});

export const recentPlayBase = z.object({
  playedAt: z.string().describe("ISO 8601 timestamp."),
  achievement: z.number().int(),
  dxScore: z.number().int(),
  maxDxScore: z.number().int(),
  fc: z.string(),
  fs: z.string(),
  track: z.number().int().nullable(),
  song: z.object({
    songId: z.string(),
    songName: z.string(),
    artist: z.string(),
    cover: z.string().nullable(),
    difficulty: z.string(),
    level: z.string(),
    levelPrecise: z.number(),
    type: z.string(),
    genre: z.string(),
  }),
});

export const recentPlayDetailed = recentPlayBase.extend({
  venue: z.string().nullable(),
  combo: z.string().nullable(),
  maxCombo: z.string().nullable(),
  syncScore: z.string().nullable(),
  maxSyncScore: z.string().nullable(),
  rating: z.number().int().nullable(),
  ratingChange: z.number().int().nullable(),
  notes: z
    .object({
      tap: noteBreakdown,
      hold: noteBreakdown,
      slide: noteBreakdown,
      touch: noteBreakdown,
      break: noteBreakdown,
      fast: z.number().int().nullable(),
      late: z.number().int().nullable(),
    })
    .nullable(),
});

/** A recent play is the base shape; detailed fields are present when the
 *  caller holds `recent:detailed:read`. */
export const recentPlay = z.union([recentPlayDetailed, recentPlayBase]);

export const albumEntry = z.object({
  id: z.string(),
  songId: z.string(),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable(),
  difficulty: z.string(),
  level: z.string(),
  levelPrecise: z.number(),
  type: z.string(),
  takenAt: z.string().nullable(),
  venue: z.string().nullable(),
  createdAt: z.string(),
  imageUrl: z
    .string()
    .nullable()
    .describe("Resolved R2 URL. Null unless `album:images:read` is granted."),
});

export const statsResponse = z.object({
  stats: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        grades: z.record(z.string(), z.number().int()),
        fc: z.record(z.string(), z.number().int()),
        fs: z.record(z.string(), z.number().int()),
        total: z.number().int(),
      }),
    ),
  ),
  totalSongs: z.record(z.string(), z.record(z.string(), z.number().int())),
});

export const errorResponse = z
  .object({ error: z.string() })
  .describe("Returned on 4xx and 5xx responses.");
