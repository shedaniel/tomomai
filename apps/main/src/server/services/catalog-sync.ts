import { db } from "@/lib/db";
import { catalogState, parentSong, scoreData, songs, tourEvents, tourEventSteps, userAlbums, userRecentSongs } from "@/lib/db/schema-pg";
import { getLogger } from "@/lib/request-logger";
import { CATALOG_MANIFEST_KEY, catalogManifestSchema } from "@tomomai/catalog/artifact";
import { and, eq, inArray, notExists, notInArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { assertCatalogIdentities, assertCatalogSource, decodeCatalogArtifact, MAX_ARTIFACT_BYTES, MAX_MANIFEST_BYTES, readBoundedResponse, shouldApplyCatalog } from "./catalog-sync-validation";

const DEFAULT_CATALOG_URL = "https://cdn.tomomai.lol";

export type CatalogSyncResult =
  | { skipped: true; sequence: number }
  | { skipped: false; sequence: number; parents: number; songs: number; tourEvents: number; deletedSongs: number; keptOrphanSongs: number };

function httpUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Catalog URL must use HTTP or HTTPS");
  return url.href;
}

function resolveCover(cover: string): string {
  if (/^https?:\/\//.test(cover) || cover === "") return cover;
  return httpUrl(cover, `${(process.env.CATALOG_COVER_BASE_URL ?? DEFAULT_CATALOG_URL).replace(/\/$/, "")}/`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function invalidateCatalog() {
  for (const tag of ["all-unique-songs", "api-v1-songs", "reserved-songs"]) revalidateTag(tag, { expire: 0 });
}

export async function syncCatalog({ force = false }: { force?: boolean } = {}): Promise<CatalogSyncResult> {
  const log = getLogger();
  const base = `${(process.env.CATALOG_URL ?? DEFAULT_CATALOG_URL).replace(/\/$/, "")}/`;
  const sourceUrl = httpUrl(CATALOG_MANIFEST_KEY, base);
  const manifestResponse = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const manifest = catalogManifestSchema.parse(JSON.parse((await readBoundedResponse(manifestResponse, MAX_MANIFEST_BYTES)).toString("utf8")));
  const [previewState] = await db.select().from(catalogState).where(eq(catalogState.id, 1));
  assertCatalogSource(previewState, sourceUrl);
  if (!shouldApplyCatalog(previewState, manifest, force)) {
    const unchanged = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(73641932)`);
      const [state] = await tx.select().from(catalogState).where(eq(catalogState.id, 1));
      assertCatalogSource(state, sourceUrl);
      return !shouldApplyCatalog(state, manifest, force);
    });
    if (unchanged) {
      invalidateCatalog();
      return { skipped: true, sequence: manifest.sequence };
    }
  }
  const artifactResponse = await fetch(httpUrl(manifest.url, base), { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  const artifact = decodeCatalogArtifact(await readBoundedResponse(artifactResponse, MAX_ARTIFACT_BYTES), manifest);

  const result = await db.transaction(async (tx): Promise<CatalogSyncResult> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73641932)`);
    const [state] = await tx.select().from(catalogState).where(eq(catalogState.id, 1));
    assertCatalogSource(state, sourceUrl);
    if (!shouldApplyCatalog(state, manifest, force)) return { skipped: true, sequence: manifest.sequence };
    const parents = await tx.select().from(parentSong).for("update");
    const localSongs = await tx.select().from(songs);
    assertCatalogIdentities(artifact, parents, localSongs);

    const eventIds = artifact.tourEvents.map(row => row.id);
    const stepIds = artifact.tourEventSteps.map(row => row.id);
    await tx.delete(tourEventSteps).where(stepIds.length ? notInArray(tourEventSteps.id, stepIds) : sql`true`);
    await tx.delete(tourEvents).where(eventIds.length ? notInArray(tourEvents.id, eventIds) : sql`true`);
    for (const batch of chunk(artifact.parents, 1000)) {
      await tx.insert(parentSong).overridingSystemValue().values(batch.map(p => ({
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
          songName: sql`excluded."songName"`,
          disambiguator: sql`excluded.disambiguator`,
          artist: sql`excluded.artist`,
          genre: sql`excluded.genre`,
          cover: sql`excluded.cover`,
          bpm: sql`excluded.bpm`,
        },
      });
    }

    for (const batch of chunk(artifact.songs, 1000)) {
      await tx.insert(songs).overridingSystemValue().values(batch.map(s => ({
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
      await tx.insert(tourEvents).overridingSystemValue().values(batch.map(e => ({
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
      await tx.insert(tourEventSteps).overridingSystemValue().values(batch.map(s => ({
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

    const artifactIds = new Set(artifact.songs.map(song => song.id));
    const removedIds = localSongs.filter(song => !artifactIds.has(String(song.id))).map(song => song.id);
    let deletedSongs = 0;
    for (const batch of chunk(removedIds, 1000)) {
      // Lock before checking references so new user records cannot race deletion.
      await tx.select({ id: songs.id }).from(songs).where(inArray(songs.id, batch)).for("update");
      const removed = await tx.delete(songs).where(and(
        inArray(songs.id, batch),
        notExists(tx.select().from(scoreData).where(eq(scoreData.songId, songs.id))),
        notExists(tx.select().from(userRecentSongs).where(eq(userRecentSongs.songId, songs.id))),
        notExists(tx.select().from(userAlbums).where(eq(userAlbums.songId, songs.id))),
      )).returning({ id: songs.id });
      deletedSongs += removed.length;
    }
    const keptOrphanSongs = removedIds.length - deletedSongs;
    if (keptOrphanSongs) log.warn({ songCount: keptOrphanSongs }, "Kept removed catalog songs referenced by user data");
    const nextState = { sequence: artifact.sequence, schemaVersion: artifact.schemaVersion, sha256: manifest.sha256, syncedAt: new Date(), sourceUrl };
    await tx.insert(catalogState).values({ id: 1, ...nextState }).onConflictDoUpdate({ target: catalogState.id, set: nextState });
    return { skipped: false, sequence: artifact.sequence, parents: artifact.parents.length, songs: artifact.songs.length, tourEvents: artifact.tourEvents.length, deletedSongs, keptOrphanSongs };
  });

  // Also invalidate unchanged retries after a previous post-commit cache failure.
  invalidateCatalog();
  log.info({ songCount: artifact.songs.length, eventCount: artifact.tourEvents.length }, "Catalog sync complete");
  return result;
}
