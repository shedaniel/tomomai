import { z } from "zod";
import { CHART_TYPE_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM, REGION_ENUM } from "./enums";

// Contract for the published catalog artifact. The data service publishes it
// to object storage; every tomomai instance (official and self-hosted) loads
// it, so integer ids are globally stable across hosts.

export const CATALOG_SCHEMA_VERSION = 1;

const bigintIdSchema = z.string().regex(/^[1-9]\d*$/).refine(
  (value) => /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807"),
  "Expected a positive PostgreSQL bigint ID",
);
const smallintSchema = z.number().int().min(-32768).max(32767);
const integerIdSchema = z.number().int().positive().max(2147483647);
const sequenceSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const artifactParentSongSchema = z.object({
  id: bigintIdSchema,
  publicId: z.string().regex(/^[A-Za-z0-9_-]{8}$/),
  songName: z.string(),
  artist: z.string(),
  genre: z.string(),
  // R2 object key ("covers/<name>.webp") or an absolute URL for non-R2 covers
  cover: z.string(),
  bpm: smallintSchema.nullable(),
  type: z.enum(CHART_TYPE_ENUM),
  difficulty: z.enum(DIFFICULTY_ENUM),
  disambiguator: smallintSchema.min(0),
});

export const artifactSongSchema = z.object({
  id: bigintIdSchema,
  parentId: bigintIdSchema,
  region: z.enum(REGION_ENUM),
  gameVersion: smallintSchema,
  addedVersion: smallintSchema,
  level: z.enum(LEVEL_ENUM),
  levelPrecise: smallintSchema,
  noteDesigner: z.string().nullable(),
  tapCount: smallintSchema.nullable(),
  holdCount: smallintSchema.nullable(),
  slideCount: smallintSchema.nullable(),
  touchCount: smallintSchema.nullable(),
  breakCount: smallintSchema.nullable(),
});

export const artifactTourEventSchema = z.object({
  id: integerIdSchema,
  name: z.string(),
  periods: z.array(z.object({ start: z.string().nullable(), end: z.string().nullable() })),
});

export const artifactTourEventStepSchema = z.object({
  id: integerIdSchema,
  eventId: integerIdSchema,
  distance: z.number().int(),
  type: z.string(),
  reward: z.string(),
});

export const catalogArtifactSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  sequence: sequenceSchema,
  generatedAt: z.iso.datetime(),
  parents: z.array(artifactParentSongSchema),
  songs: z.array(artifactSongSchema),
  tourEvents: z.array(artifactTourEventSchema),
  tourEventSteps: z.array(artifactTourEventStepSchema),
}).superRefine((artifact, ctx) => {
  const checkUnique = <T>(rows: T[], key: (row: T) => string | number, field: string) => {
    const seen = new Set<string | number>();
    rows.forEach((row, index) => {
      const value = key(row);
      if (seen.has(value)) ctx.addIssue({ code: "custom", path: [field, index], message: "Duplicate catalog identity" });
      seen.add(value);
    });
  };
  checkUnique(artifact.parents, row => row.id, "parents");
  checkUnique(artifact.parents, row => row.publicId, "parents");
  checkUnique(artifact.parents, row => JSON.stringify([row.songName, row.type, row.difficulty, row.disambiguator]), "parents");
  checkUnique(artifact.songs, row => row.id, "songs");
  checkUnique(artifact.songs, row => JSON.stringify([row.parentId, row.region, row.gameVersion]), "songs");
  checkUnique(artifact.tourEvents, row => row.id, "tourEvents");
  checkUnique(artifact.tourEvents, row => row.name, "tourEvents");
  checkUnique(artifact.tourEventSteps, row => row.id, "tourEventSteps");
  const parents = new Set(artifact.parents.map(row => row.id));
  artifact.songs.forEach((row, index) => {
    if (!parents.has(row.parentId)) ctx.addIssue({ code: "custom", path: ["songs", index, "parentId"], message: "Missing parent" });
  });
  const events = new Set(artifact.tourEvents.map(row => row.id));
  artifact.tourEventSteps.forEach((row, index) => {
    if (!events.has(row.eventId)) ctx.addIssue({ code: "custom", path: ["tourEventSteps", index, "eventId"], message: "Missing event" });
  });
});

// Small manifest at a stable URL, pointing at the immutable artifact object.
export const catalogManifestSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  sequence: sequenceSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: z.union([z.url({ protocol: /^https?$/ }), z.string().regex(/^catalog\/catalog-[1-9]\d*\.json\.gz$/)]),
  generatedAt: z.iso.datetime(),
  counts: z.object({
    parents: z.number().int().nonnegative(),
    songs: z.number().int().nonnegative(),
    tourEvents: z.number().int().nonnegative(),
  }),
});

export type ArtifactParentSong = z.infer<typeof artifactParentSongSchema>;
export type ArtifactSong = z.infer<typeof artifactSongSchema>;
export type ArtifactTourEvent = z.infer<typeof artifactTourEventSchema>;
export type ArtifactTourEventStep = z.infer<typeof artifactTourEventStepSchema>;
export type CatalogArtifact = z.infer<typeof catalogArtifactSchema>;
export type CatalogManifest = z.infer<typeof catalogManifestSchema>;

export const CATALOG_MANIFEST_KEY = "catalog/latest.json";

export function catalogArtifactKey(sequence: number) {
  return `catalog/catalog-${sequence}.json.gz`;
}
