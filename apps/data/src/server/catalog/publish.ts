import { publishPublicCatalog } from "@/server/services/admin/song-catalog";
import { db } from "@/lib/db";
import { catalogReleases, parentSong, songs, tourEvents, tourEventSteps } from "@/lib/db/schema";
import { uploadCatalogArtifact, uploadCatalogManifest } from "@tomomai/server/r2";
import {
  CATALOG_MANIFEST_KEY,
  CATALOG_SCHEMA_VERSION,
  catalogArtifactKey,
  catalogArtifactSchema,
  type CatalogArtifact,
  type CatalogManifest,
} from "@tomomai/catalog/artifact";
import { createHash } from "crypto";
import { sql } from "drizzle-orm";
import { gzipSync } from "zlib";

export async function publishCatalog() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(73641932)`);
    const [parents, songRows, eventRows, stepRows] = await Promise.all([
      tx.select().from(parentSong),
      tx.select().from(songs),
      tx.select().from(tourEvents),
      tx.select().from(tourEventSteps),
    ]);

    // Sequence values survive rollback, so an interrupted publication never reuses an immutable key.
    const reserved = await tx.execute(sql`select nextval(pg_get_serial_sequence('catalog_releases', 'id')) as sequence`);
    const sequence = Number(reserved[0].sequence);

    const artifact: CatalogArtifact = {
      schemaVersion: CATALOG_SCHEMA_VERSION,
      sequence,
      generatedAt: new Date().toISOString(),
      parents: parents.map(p => ({
        id: String(p.id),
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
        id: String(s.id),
        parentId: String(s.parentId),
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


    await tx.insert(catalogReleases).values({
      id: sequence,
      sequence,
      schemaVersion: CATALOG_SCHEMA_VERSION,
      sha256,
      url: key,
      parentCount: artifact.parents.length,
      songCount: artifact.songs.length,
      tourEventCount: artifact.tourEvents.length,
    });

    const publication = await publishPublicCatalog(tx);
    await uploadCatalogManifest(CATALOG_MANIFEST_KEY, Buffer.from(JSON.stringify(manifest), "utf-8"));
    return { ...manifest, ...publication };
  });
}
