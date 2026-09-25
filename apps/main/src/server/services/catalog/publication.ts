import type { CanonicalGameId } from "@/lib/games/types";
import { requireConfiguredSource } from "@/lib/games/registry";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { parentSong, songs } from "@/lib/db/schema-pg";
import { parentCatalogue, songCatalogue } from "@/lib/api/schemas";
import { catalogPrefix, isCatalogVersion, songCatalogKey } from "@/lib/api/catalog-location";
import { formatSongInstanceId } from "@/lib/catalog/song-instance-id";
import { getAvailableVersions } from "@/lib/games/versions";
import { putR2Object } from "@/lib/r2";
import type { z } from "zod";

export async function publishSongCatalog(game: CanonicalGameId): Promise<{ songCount: number; bytes: number }> {
  requireConfiguredSource(game, "catalog");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(73641932)`);
    // One statement keeps the dictionary and its instances on the same database snapshot.
    const rows = await tx.select({
      parent: {
        songId: parentSong.publicId,
        songName: parentSong.songName,
        artist: parentSong.artist,
        cover: parentSong.cover,
        type: parentSong.type,
        genre: parentSong.genre,
        difficulty: parentSong.difficulty,
        bpm: parentSong.bpm,
        disambiguator: parentSong.disambiguator,
      },
      instance: {
        level: songs.level,
        levelPrecise: songs.levelPrecise,
        region: songs.region,
        gameVersion: songs.gameVersion,
        addedVersion: songs.addedVersion,
        noteDesigner: songs.noteDesigner,
        metadata: songs.metadata,
      },
    }).from(parentSong).leftJoin(songs, and(eq(songs.parentId, parentSong.id), eq(songs.game, game)))
      .where(eq(parentSong.game, game))
      .orderBy(parentSong.songName, parentSong.difficulty, parentSong.publicId, songs.region, songs.gameVersion);

    const parents = new Map<string, z.infer<typeof parentCatalogue>["parents"][number]>();
    const slices = new Map<string, z.infer<typeof songCatalogue>>();
    // Empty slices must also overwrite R2, otherwise removing their final song leaves stale data.
    for (const region of ["jp", "intl", "cn"] as const) {
      for (const version of getAvailableVersions(game, region)) {
        slices.set(songCatalogKey(game, region, version.id), { game, songs: [] });
      }
    }
    let songCount = 0;
    for (const { parent, instance } of rows) {
      parents.set(parent.songId, parent);
      if (!instance) continue;
      if (!isCatalogVersion(game, instance.region, instance.gameVersion)) {
        throw new Error(`Unknown catalog slice: ${instance.region}/${instance.gameVersion}`);
      }
      slices.get(songCatalogKey(game, instance.region, instance.gameVersion))!.songs.push({
        ...parent,
        ...instance,
        songId: formatSongInstanceId(parent.songId, instance.region, instance.gameVersion),
      });
      songCount++;
    }

    const objects = [
      { key: `${catalogPrefix(game)}/parents`, body: JSON.stringify(parentCatalogue.parse({ game, parents: [...parents.values()] })) },
      ...[...slices].map(([key, catalog]) => ({ key, body: JSON.stringify(songCatalogue.parse(catalog)) })),
    ];
    // Validate everything before the first write; a failed write rejects the update and a retry rebuilds every slice.
    for (let start = 0; start < objects.length; start += 8) {
      const results = await Promise.allSettled(objects.slice(start, start + 8).map((object) => putR2Object({
        ...object,
        contentType: "application/json; charset=utf-8",
        cacheControl: "public, max-age=3600",
        abortSignal: AbortSignal.timeout(30_000),
      })));
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    return { songCount, bytes: objects.reduce((total, object) => total + Buffer.byteLength(object.body), 0) };
  });
}
