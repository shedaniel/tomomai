import { db } from "@/lib/db";
import { catalogState, parentSong, scoreData, songs, tourEvents, tourEventSteps, userAlbums, userRecentSongs } from "@/lib/db/schema-pg";
import { logger } from "@/lib/logger";
import {
  CATALOG_MANIFEST_KEY,
  CATALOG_SCHEMA_VERSION,
  catalogArtifactSchema,
  catalogManifestSchema,
  type CatalogArtifact,
  type CatalogManifest,
} from "@tomomai/catalog/artifact";
import { createHash } from "crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { gunzipSync } from "zlib";

// Loads the published catalog artifact into the local database. This is how
// every instance (official and self-hosted) receives chart data: the data
// service assigns the canonical integer ids, and this sync upserts them
// verbatim, so user-data FKs stay valid on every host.

const DEFAULT_CATALOG_URL = "https://cdn.tomomai.lol";

export type CatalogSyncResult =
  | { skipped: true; sequence: number }
  | {
    skipped: false;
    sequence: number;
    parents: number;
    songs: number;
    tourEvents: number;
    deletedSongs: number;
    keptOrphanSongs: number;
  };

function catalogBaseUrl() {
  return (process.env.CATALOG_URL ?? DEFAULT_CATALOG_URL).replace(/\/$/, "");
}

function coverBaseUrl() {
  return (process.env.CATALOG_COVER_BASE_URL ?? DEFAULT_CATALOG_URL).replace(/\/$/, "");
}

// The artifact stores covers as R2 object keys ("covers/<file>.webp"); a
// self-hosted instance resolves them against the official CDN by default, so
// no cover bucket is required. Absolute URLs (non-R2 sources) pass through.
function resolveCover(cover: string): string {
  if (/^https?:\/\//.test(cover)) return cover;
  return `${coverBaseUrl()}/${cover}`;
}

async function fetchManifest(): Promise<CatalogManifest> {
  const url = `${catalogBaseUrl()}/${CATALOG_MANIFEST_KEY}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch catalog manifest from ${url}: ${res.status}`);
  }
  return catalogManifestSchema.parse(await res.json());
}

async function fetchArtifact(manifest: CatalogManifest): Promise<CatalogArtifact> {
  const url = /^https?:\/\//.test(manifest.url) ? manifest.url : `${catalogBaseUrl()}/${manifest.url.replace(/^\//, "")}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch catalog artifact from ${url}: ${res.status}`);
  }
  const compressed = Buffer.from(await res.arrayBuffer());

  const sha256 = createHash("sha256").update(compressed).digest("hex");
  if (sha256 !== manifest.sha256) {
    throw new Error(`Catalog artifact checksum mismatch: expected ${manifest.sha256}, got ${sha256}`);
  }

  const artifact = catalogArtifactSchema.parse(JSON.parse(gunzipSync(compressed).toString("utf-8")));
  if (artifact.sequence !== manifest.sequence) {
    throw new Error(`Catalog artifact sequence mismatch: manifest ${manifest.sequence}, artifact ${artifact.sequence}`);
  }
  return artifact;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function syncCatalog({ force = false }: { force?: boolean } = {}): Promise<CatalogSyncResult> {
  const log = logger.child({ service: "catalog-sync" });

  const manifest = await fetchManifest();
  if (manifest.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    throw new Error(
      `Catalog schema version ${manifest.schemaVersion} is not supported (expected ${CATALOG_SCHEMA_VERSION}); update this instance first`
    );
  }

  const state = await db.select().from(catalogState).where(eq(catalogState.id, 1));
  if (!force && state.length > 0 && state[0].sequence === manifest.sequence) {
    log.info({ sequence: manifest.sequence }, "Catalog already up to date");
    return { skipped: true, sequence: manifest.sequence };
  }

  const artifact = await fetchArtifact(manifest);
  log.info({
    sequence: artifact.sequence,
    parents: artifact.parents.length,
    songs: artifact.songs.length,
    tourEvents: artifact.tourEvents.length,
  }, "Loading catalog artifact");

  let deletedSongs = 0;
  let keptOrphanSongs = 0;

  await db.transaction(async (tx) => {
    for (const batch of chunk(artifact.parents, 1000)) {
      await tx.insert(parentSong).values(batch.map(p => ({
        id: BigInt(p.id),
        publicId: p.publicId,
        songName: p.songName,
        artist: p.artist,
        genre: p.genre,
        cover: resolveCover(p.cover),
        bpm: p.bpm,
        type: p.type,
        difficulty: p.difficulty,
        disambiguator: p.disambiguator,
      }))).onConflictDoUpdate({
        target: parentSong.id,
        set: {
          publicId: sql`excluded."publicId"`,
          songName: sql`excluded."songName"`,
          artist: sql`excluded.artist`,
          genre: sql`excluded.genre`,
          cover: sql`excluded.cover`,
          bpm: sql`excluded.bpm`,
          type: sql`excluded.type`,
          difficulty: sql`excluded.difficulty`,
          disambiguator: sql`excluded.disambiguator`,
        },
      });
    }

    for (const batch of chunk(artifact.songs, 1000)) {
      await tx.insert(songs).values(batch.map(s => ({
        id: BigInt(s.id),
        parentId: BigInt(s.parentId),
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
      }))).onConflictDoUpdate({
        target: songs.id,
        set: {
          parentId: sql`excluded."parentId"`,
          region: sql`excluded.region`,
          gameVersion: sql`excluded."gameVersion"`,
          addedVersion: sql`excluded."addedVersion"`,
          level: sql`excluded.level`,
          levelPrecise: sql`excluded."levelPrecise"`,
          noteDesigner: sql`excluded."noteDesigner"`,
          tapCount: sql`excluded."tapCount"`,
          holdCount: sql`excluded."holdCount"`,
          slideCount: sql`excluded."slideCount"`,
          touchCount: sql`excluded."touchCount"`,
          breakCount: sql`excluded."breakCount"`,
        },
      });
    }

    for (const batch of chunk(artifact.tourEvents, 1000)) {
      await tx.insert(tourEvents).values(batch.map(e => ({
        id: e.id,
        name: e.name,
        periods: e.periods,
        updatedAt: new Date(),
      }))).onConflictDoUpdate({
        target: tourEvents.id,
        set: {
          name: sql`excluded.name`,
          periods: sql`excluded.periods`,
          updatedAt: sql`excluded."updatedAt"`,
        },
      });
    }

    for (const batch of chunk(artifact.tourEventSteps, 1000)) {
      await tx.insert(tourEventSteps).values(batch.map(s => ({
        id: s.id,
        eventId: s.eventId,
        distance: s.distance,
        type: s.type,
        reward: s.reward,
      }))).onConflictDoUpdate({
        target: tourEventSteps.id,
        set: {
          eventId: sql`excluded."eventId"`,
          distance: sql`excluded.distance`,
          type: sql`excluded.type`,
          reward: sql`excluded.reward`,
        },
      });
    }

    // Deletions. Parents are never deleted (user data renders through them).
    // Child songs absent from the artifact are deleted only when no user data
    // references them; referenced orphans are kept and logged.
    const artifactSongIds = new Set(artifact.songs.map(s => String(s.id)));
    const localSongIds = await tx.select({ id: songs.id }).from(songs);
    const removedIds = localSongIds.map(r => r.id).filter(id => !artifactSongIds.has(String(id)));

    if (removedIds.length > 0) {
      const referenced = new Set<string>();
      for (const batch of chunk(removedIds, 1000)) {
        const [scoreRefs, recentRefs, albumRefs] = await Promise.all([
          tx.selectDistinct({ id: scoreData.songId }).from(scoreData).where(inArray(scoreData.songId, batch)),
          tx.selectDistinct({ id: userRecentSongs.songId }).from(userRecentSongs).where(inArray(userRecentSongs.songId, batch)),
          tx.selectDistinct({ id: userAlbums.songId }).from(userAlbums).where(inArray(userAlbums.songId, batch)),
        ]);
        for (const r of [...scoreRefs, ...recentRefs, ...albumRefs]) referenced.add(String(r.id));
      }

      const deletable = removedIds.filter(id => !referenced.has(String(id)));
      keptOrphanSongs = removedIds.length - deletable.length;
      for (const batch of chunk(deletable, 1000)) {
        await tx.delete(songs).where(inArray(songs.id, batch));
        deletedSongs += batch.length;
      }
      if (keptOrphanSongs > 0) {
        log.warn({ keptOrphanSongs }, "Songs removed upstream were kept because user data references them");
      }
    }

    // Tour events have no user-data FKs; mirror the artifact exactly.
    const artifactEventIds = artifact.tourEvents.map(e => e.id);
    const artifactStepIds = artifact.tourEventSteps.map(s => s.id);
    if (artifactEventIds.length > 0) {
      await tx.delete(tourEvents).where(sql`${tourEvents.id} NOT IN ${artifactEventIds}`);
    }
    if (artifactStepIds.length > 0) {
      await tx.delete(tourEventSteps).where(sql`${tourEventSteps.id} NOT IN ${artifactStepIds}`);
    }

    await tx.insert(catalogState).values({
      id: 1,
      sequence: artifact.sequence,
      schemaVersion: artifact.schemaVersion,
      sha256: manifest.sha256,
      syncedAt: new Date(),
    }).onConflictDoUpdate({
      target: catalogState.id,
      set: {
        sequence: artifact.sequence,
        schemaVersion: artifact.schemaVersion,
        sha256: manifest.sha256,
        syncedAt: new Date(),
      },
    });
  });

  // Best-effort: only available inside a Next request context
  try {
    revalidateTag("all-unique-songs", "max");
    revalidateTag("api-v1-songs", "max");
  } catch {
    log.warn("revalidateTag unavailable outside a request context; caches expire via TTL");
  }

  log.info({ sequence: artifact.sequence, deletedSongs, keptOrphanSongs }, "Catalog sync complete");

  return {
    skipped: false,
    sequence: artifact.sequence,
    parents: artifact.parents.length,
    songs: artifact.songs.length,
    tourEvents: artifact.tourEvents.length,
    deletedSongs,
    keptOrphanSongs,
  };
}
