import { z } from "zod";
import type { CodeKind } from "@/lib/games/codes";
import type { CanonicalGameId } from "@/lib/games/ids";
import type { GameSnapshotSummary } from "@/lib/games/player-view";
import { gameIdSchema, regionSchema as gameRegionSchema } from "@/lib/games/schema";
import type { ScoreStatusKind } from "@/lib/games/types";
import type { songs } from "@/lib/db/schema-pg";
import { parentPublicIdSchema, songInstanceIdSchema } from "@/lib/catalog/song-instance-id";

/**
 * The response parts every game shares. The OpenAPI document and the Developer Center render these schemas,
 * so every field keeps its `.describe(...)`.
 */

export const regionSchema = gameRegionSchema.describe("Game region to read data from.");

const CODE_LABELS: { readonly [K in CodeKind]: string } = {
  difficulty: "Chart difficulty",
  chartType: "Chart type",
  comboStatus: "Combo status",
  syncStatus: "Sync status",
  clearStatus: "Clear status",
  titleType: "Title type",
};

/** A game-specific integer code, decoded through the codes endpoint. */
function codeField(kind: CodeKind) {
  return z.number().int().describe(`${CODE_LABELS[kind]} code. \`GET /api/v1/games/{game}/codes\` lists the \`${kind}\` keys by code.`);
}

function codeKeys(kind: CodeKind) {
  return z.array(z.string()).readonly().describe(`${CODE_LABELS[kind]} keys. The code of a key is its index.`);
}

export const codeTable = z.object({
  difficulty: codeKeys("difficulty"),
  chartType: codeKeys("chartType"),
  comboStatus: codeKeys("comboStatus"),
  syncStatus: codeKeys("syncStatus"),
  clearStatus: codeKeys("clearStatus"),
  titleType: codeKeys("titleType"),
} satisfies Record<CodeKind, z.ZodType>);

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
};

const levelPreciseField = z
  .number()
  .int()
  .describe("Difficulty constant scaled ×10 (integer). Divide by 10 for the displayed decimal, e.g. 147 → 14.7.");

const scoreValueField = z.number().int().describe("The score as an integer. The overview guide gives each game's scale.");
const secondaryScoreField = z.number().int().describe("The secondary score, such as maimai's DX score. 0 for a game without one.");

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

/** A fetched score that matched no single catalog chart. Fetch sessions store their report in this shape. */
export const notFoundScore = z.object({
  songName: z.string(),
  difficulty: codeField("difficulty"),
  type: codeField("chartType"),
});

export type NotFoundScore = z.infer<typeof notFoundScore>;

export const fetchStatus = z.object({
  id: z.string(),
  status: z.enum(["pending", "completed", "failed"]),
  startedAt: z.string().describe("ISO 8601 timestamp."),
  completedAt: z.string().nullable().describe("ISO 8601 timestamp, null while pending."),
  errorMessage: z.string().nullable(),
  statusStates: z.string().nullable().describe("Comma-separated progress markers, null if not started."),
  notFoundScores: z
    .array(notFoundScore)
    .nullable()
    .describe("Fetched scores that matched no single catalog chart. Null when every score matched."),
});

export const fetchStartResult = z.object({
  sessionId: z.string(),
  status: z.literal("pending"),
});

export const successResponse = z.object({ success: z.literal(true) });

export const chartCatalogueEntry = z.object({
  songId: parentPublicIdSchema.describe("Chart ID (8-char nanoid), the prefix of every composite instance ID."),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable().describe("Cover image URL, may be null."),
  type: codeField("chartType"),
  genre: z.string(),
  difficulty: codeField("difficulty"),
  bpm: z.number().nullable(),
  disambiguator: z
    .number()
    .int()
    .describe("0 except for the rare distinct charts sharing the same name, type and difficulty."),
});

export const songCatalogueEntry = z.object({
  songId: songInstanceIdSchema.describe("Composite instance ID <chartId>:<regionLetter><gameVersion>, e.g. Ab3xK9pQ:j11 for jp at version 11. The chart ID is an 8-char nanoid, regions are j, i and c, and versions may be negative. Truncate at ':' for the chart-level ID."),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable().describe("Cover image URL, may be null."),
  type: codeField("chartType"),
  genre: z.string(),
  difficulty: codeField("difficulty"),
  level: z.string().describe("Displayed level, e.g. \"14+\"."),
  levelPrecise: levelPreciseField,
  region: gameRegionSchema,
  gameVersion: z.number().int(),
  addedVersion: z.number().int(),
  bpm: z.number().nullable(),
  noteDesigner: z.string().nullable().describe("Chart designer name."),
  levelPreciseEstimated: z.literal(true).optional().describe("Present when `levelPrecise` is an estimate rather than the published constant."),
  addedVersionEstimated: z.literal(true).optional().describe("Present when `addedVersion` is inferred rather than known."),
});

export const snapshotCore = z.object({
  id: z.string().describe("Public snapshot ID."),
  fetchedAt: z.string().describe("ISO 8601 timestamp."),
  rating: z.number().int(),
  displayName: z.string().nullable(),
  gameVersion: z.number().int(),
  versionPlayCount: z.number().int().nullable(),
  totalPlayCount: z.number().int().nullable(),
});

export const songScore = z.object({
  songId: z.string(),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable(),
  difficulty: codeField("difficulty"),
  level: z.string(),
  levelPrecise: levelPreciseField,
  type: codeField("chartType"),
  genre: z.string(),
  addedVersion: z.number().int(),
  scoreValue: scoreValueField,
  secondaryScore: secondaryScoreField,
  comboStatus: codeField("comboStatus"),
  syncStatus: codeField("syncStatus"),
  clearStatus: codeField("clearStatus"),
  rating: z.number().int().optional().describe("Chart rating under the current chart constants. Only present on B50-restricted responses."),
});

export const snapshotEvent = z.object({
  eventType: z.string(),
  name: z.string(),
  currentDistance: z.number().int().nullable(),
  nextRewardDistance: z.number().int().nullable(),
  state: z.string(),
  imageUrl: z.string().nullable(),
  eventPeriodStart: z.string().nullable(),
  eventPeriodEnd: z.string().nullable(),
});

export const PLAYLOG_DESCRIPTION =
  "The play's detail page on the game site. Null unless `recent:detailed:read` is granted, and null while the page has not been fetched.";

export const recentPlayCore = z.object({
  playedAt: z.string().describe("ISO 8601 timestamp."),
  scoreValue: scoreValueField,
  secondaryScore: secondaryScoreField,
  comboStatus: codeField("comboStatus"),
  syncStatus: codeField("syncStatus"),
  clearStatus: codeField("clearStatus"),
  track: z.number().int().nullable().describe("Track number within the credit."),
  song: z.object({
    songId: z.string(),
    songName: z.string(),
    artist: z.string(),
    cover: z.string().nullable(),
    difficulty: codeField("difficulty"),
    level: z.string(),
    levelPrecise: levelPreciseField,
    type: codeField("chartType"),
    genre: z.string(),
  }),
});

export const albumEntry = z.object({
  id: z.string(),
  songId: z.string(),
  songName: z.string(),
  artist: z.string(),
  cover: z.string().nullable(),
  difficulty: codeField("difficulty"),
  level: z.string(),
  levelPrecise: levelPreciseField,
  type: codeField("chartType"),
  takenAt: z.string().nullable(),
  venue: z.string().nullable(),
  createdAt: z.string(),
  imageUrl: z
    .string()
    .nullable()
    .describe("Resolved R2 URL. Null unless `album:images:read` is granted."),
});

const statusCounts = z.record(z.string(), z.number().int()).describe("Scores per status code, leaving out the code for no status.");

export const statsResponse = z.object({
  stats: z.record(
    z.string(),
    z.record(
      z.string(),
      z.object({
        grades: z.record(z.string(), z.number().int()).describe("Scores per grade label, such as `SSS+`."),
        statuses: z.object({
          comboStatus: statusCounts.optional(),
          syncStatus: statusCounts.optional(),
          clearStatus: statusCounts.optional(),
        } satisfies Record<ScoreStatusKind, z.ZodType>).describe("Present for each status kind the game records."),
        total: z.number().int().describe("Scores in this bucket."),
      }),
    ).describe("Buckets keyed by difficulty code."),
  ).describe("Score distribution keyed by the charts' added version."),
  totalSongs: z
    .record(z.string(), z.record(z.string(), z.number().int()))
    .describe("Catalog charts keyed by added version, then difficulty code."),
});

export const errorResponse = z
  .object({
    error: z.string(),
    code: z
      .string()
      .optional()
      .describe("Stable error code for an invalid parameter, a game boundary or a fetch start refusal, when applicable."),
  })
  .describe("Returned on 4xx and 5xx responses.");

export const songCatalogue = z.object({ game: gameIdSchema, songs: z.array(songCatalogueEntry) });
export const parentCatalogue = z.object({ game: gameIdSchema, parents: z.array(chartCatalogueEntry) });

type ApiSongRow = Pick<typeof songs.$inferSelect, "tapCount" | "holdCount" | "slideCount" | "touchCount" | "breakCount" | "metadata">;
type ApiSnapshotRow = Pick<GameSnapshotSummary, "courseRankUrl" | "classRankUrl" | "stars">;

/** Builds the `details` a game adds to song and snapshot responses. Recent plays already carry theirs. */
export type GameApiDetails<G extends CanonicalGameId> = {
  song(chart: ApiSongRow): { game: G };
  snapshot(snapshot: ApiSnapshotRow): { game: G };
};
