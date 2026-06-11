import { z } from "zod";
import { CHART_TYPE_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM, REGION_ENUM } from "./enums";

// Contract for the published catalog artifact. The data service publishes it
// to object storage; every tomomai instance (official and self-hosted) loads
// it, so integer ids are globally stable across hosts.

export const CATALOG_SCHEMA_VERSION = 1;

export const artifactParentSongSchema = z.object({
  id: z.number().int().positive(),
  publicId: z.string().min(1).max(8),
  songName: z.string(),
  artist: z.string(),
  genre: z.string(),
  // R2 object key ("covers/<name>.webp") or an absolute URL for non-R2 covers
  cover: z.string(),
  bpm: z.number().int().nullable(),
  type: z.enum(CHART_TYPE_ENUM),
  difficulty: z.enum(DIFFICULTY_ENUM),
  disambiguator: z.number().int().min(0),
});

export const artifactSongSchema = z.object({
  id: z.number().int().positive(),
  parentId: z.number().int().positive(),
  region: z.enum(REGION_ENUM),
  gameVersion: z.number().int(),
  addedVersion: z.number().int(),
  level: z.enum(LEVEL_ENUM),
  levelPrecise: z.number().int(),
  noteDesigner: z.string().nullable(),
  tapCount: z.number().int().nullable(),
  holdCount: z.number().int().nullable(),
  slideCount: z.number().int().nullable(),
  touchCount: z.number().int().nullable(),
  breakCount: z.number().int().nullable(),
});

export const artifactTourEventSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  periods: z.array(z.object({ start: z.string().nullable(), end: z.string().nullable() })),
});

export const artifactTourEventStepSchema = z.object({
  id: z.number().int().positive(),
  eventId: z.number().int().positive(),
  distance: z.number().int(),
  type: z.string(),
  reward: z.string(),
});

export const catalogArtifactSchema = z.object({
  schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
  sequence: z.number().int().positive(),
  generatedAt: z.string(),
  parents: z.array(artifactParentSongSchema),
  songs: z.array(artifactSongSchema),
  tourEvents: z.array(artifactTourEventSchema),
  tourEventSteps: z.array(artifactTourEventStepSchema),
});

// Small manifest at a stable URL, pointing at the immutable artifact object.
export const catalogManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  sequence: z.number().int().positive(),
  sha256: z.string().length(64),
  url: z.string(),
  generatedAt: z.string(),
  counts: z.object({
    parents: z.number().int(),
    songs: z.number().int(),
    tourEvents: z.number().int(),
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
