import { db } from "@/lib/db";
import { catalogReleases, parentSong, songs, tourEvents, tourEventSteps } from "@/lib/db/schema";
import { uploadCatalogArtifact, uploadCatalogManifest } from "@/lib/r2";
import {
  CATALOG_MANIFEST_KEY,
  CATALOG_SCHEMA_VERSION,
  catalogArtifactKey,
  catalogArtifactSchema,
  type CatalogArtifact,
  type CatalogManifest,
} from "@tomomai/catalog/artifact";
import { createHash } from "crypto";
import { desc } from "drizzle-orm";
import { gzipSync } from "zlib";

// Builds the catalog artifact from the canonical database and publishes it to
// object storage: an immutable per-sequence object plus the latest.json
// pointer that every tomomai instance polls.

export async function publishCatalog(): Promise<CatalogManifest> {
  const [parents, songRows, eventRows, stepRows, lastRelease] = await Promise.all([
    db.select().from(parentSong),
    db.select().from(songs),
    db.select().from(tourEvents),
    db.select().from(tourEventSteps),
    db.select().from(catalogReleases).orderBy(desc(catalogReleases.sequence)).limit(1),
  ]);

  const sequence = (lastRelease[0]?.sequence ?? 0) + 1;

  const artifact: CatalogArtifact = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    sequence,
    generatedAt: new Date().toISOString(),
    parents: parents.map(p => ({
      id: Number(p.id),
      publicId: p.publicId,
      songName: p.songName,
      artist: p.artist,
      genre: p.genre,
      cover: p.cover,
      bpm: p.bpm,
      type: p.type,
      difficulty: p.difficulty,
      disambiguator: p.disambiguator,
    })),
    songs: songRows.map(s => ({
      id: Number(s.id),
      parentId: Number(s.parentId),
      region: s.region,
      gameVersion: s.gameVersion,
      addedVersion: s.addedVersion,
      level: s.level,
      levelPrecise: s.levelPrecise,
      noteDesigner: s.noteDesigner,
      tapCount: s.tapCount,
      holdCount: s.holdCount,
      slideCount: s.slideCount,
      touchCount: s.touchCount,
      breakCount: s.breakCount,
    })),
    tourEvents: eventRows.map(e => ({
      id: e.id,
      name: e.name,
      periods: e.periods,
    })),
    tourEventSteps: stepRows.map(s => ({
      id: s.id,
      eventId: s.eventId,
      distance: s.distance,
      type: s.type,
      reward: s.reward,
    })),
  };

  // Validate against the shared contract before anything leaves this host
  catalogArtifactSchema.parse(artifact);

  const compressed = gzipSync(Buffer.from(JSON.stringify(artifact), "utf-8"));
  const sha256 = createHash("sha256").update(compressed).digest("hex");
  const key = catalogArtifactKey(sequence);

  const manifest: CatalogManifest = {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    sequence,
    sha256,
    url: key,
    generatedAt: artifact.generatedAt,
    counts: {
      parents: artifact.parents.length,
      songs: artifact.songs.length,
      tourEvents: artifact.tourEvents.length,
    },
  };

  await uploadCatalogArtifact(key, compressed);
  await uploadCatalogManifest(CATALOG_MANIFEST_KEY, Buffer.from(JSON.stringify(manifest), "utf-8"));

  await db.insert(catalogReleases).values({
    sequence,
    schemaVersion: CATALOG_SCHEMA_VERSION,
    sha256,
    url: key,
    parentCount: artifact.parents.length,
    songCount: artifact.songs.length,
    tourEventCount: artifact.tourEvents.length,
  });

  return manifest;
}
