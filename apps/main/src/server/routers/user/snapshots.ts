import type { GameSnapshotData } from "@/lib/games/player-view";
import { rateScores, sortByRating } from "@/lib/games/ranking";
import { maimaiCompatibilityGameSchema, regionSchema } from "@/lib/games/schema";
import { gameContextInput, validateGameInput } from "./game-input";
import { deleteUserSnapshot, fetchSnapshotData, fetchUserSnapshots, gameSnapshotColumns } from "@/server/queries/snapshots";
import { toMaimaiChart, toMaimaiResult, toMaimaiSnapshotHeader } from "@/lib/games/maimai/legacy-view";
import { db } from '@/lib/db';
import { parentSong, scoreData, snapshotScores, songs, userSnapshots } from '@/lib/db/schema-pg';
import { fetchRatingHistory } from "@/server/queries/rating-history";
import { copySnapshotToVersion } from "@/server/services/games/snapshot-copy";
import { getVersion, getAvailableVersions } from "@/lib/games/versions";
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';
import { revalidatePublicProfileForUser } from '@/lib/profile-cache';

export const snapshotsRouter = router({
  getSnapshots: protectedProcedure
    .input(z.object({ ...gameContextInput }))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchUserSnapshots(game, ctx.session.user.id, region);
    }),
  /** Null when the snapshot is missing or belongs to someone else. The dashboard and its server prefetch show that as no data, not an error. */
  getSnapshotData: protectedProcedure
    .input(z.object({ ...gameContextInput, snapshotId: z.string() }))
    .query(async ({ ctx, input }): Promise<GameSnapshotData | null> => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchSnapshotData(game, ctx.session.user.id, input.snapshotId, region);
    }),

  getRatingHistory: protectedProcedure
    .input(z.object(gameContextInput))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "rating");
      return fetchRatingHistory(game, ctx.session.user.id, region);
    }),

  deleteSnapshot: protectedProcedure
    .input(z.object({ ...gameContextInput, snapshotId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { game } = validateGameInput(input, "scores");
      const { deleted } = await deleteUserSnapshot(
        game, ctx.session.user.id,
        input.snapshotId,
        input.region,
      );
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      await revalidatePublicProfileForUser(input.game, ctx.session.user.id, [input.region]);
      return { success: true };
    }),

  exportSnapshotData: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      snapshotId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const [row] = await db
        .select({ id: userSnapshots.id, region: userSnapshots.region, snapshot: gameSnapshotColumns })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.publicId, input.snapshotId),
            eq(userSnapshots.game, input.game),
            eq(userSnapshots.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!row) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      const scores = await db
        .select({
          songName: parentSong.songName,
          artist: parentSong.artist,
          cover: parentSong.cover,
          difficultyCode: parentSong.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          typeCode: parentSong.type,
          addedVersion: songs.addedVersion,
          scoreValue: scoreData.scoreValue,
          secondaryScore: scoreData.secondaryScore,
          comboStatus: scoreData.comboStatus,
          syncStatus: scoreData.syncStatus,
        })
        .from(snapshotScores)
        .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(eq(snapshotScores.game, input.game), eq(snapshotScores.snapshotId, row.id)))
        .orderBy(parentSong.songName, parentSong.difficulty);

      const header = toMaimaiSnapshotHeader(row.snapshot);
      return {
        metadata: {
          id: header.id,
          displayName: header.displayName,
          trophyType: header.titleType,
          trophy: header.title,
          region: row.region,
          fetchedAt: header.fetchedAt,
          gameVersion: getVersion(input.game, header.gameVersion)?.name ?? String(header.gameVersion),
          rating: header.rating,
          stars: header.stars,
          courseRankUrl: header.courseRankUrl,
          classRankUrl: header.classRankUrl,
          totalPlayCount: header.totalPlayCount,
          currentVersionPlayCount: header.versionPlayCount,
        },
        songs: sortByRating(rateScores(input.game, scores, header.gameVersion)).map(score => {
          const { difficulty, type } = toMaimaiChart(score);
          const { achievement, dxScore, fc, fs } = toMaimaiResult(score);
          return {
            songName: score.songName,
            artist: score.artist,
            cover: score.cover,
            difficulty,
            level: score.level,
            levelPrecise: score.levelPrecise,
            type,
            gameVersion: getVersion(input.game, score.addedVersion)?.shortName ?? String(score.addedVersion),
            achievement,
            dxScore,
            fc,
            fs,
            rating: score.rating,
          };
        }),
        iconUrl: header.iconUrl,
      };
    }),

  getAvailableVersionsForCopy: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      region: regionSchema,
      currentVersion: z.number(),
    }))
    .query(async ({ input }) => {
      validateGameInput(input, "scores");
      const availableVersions = getAvailableVersions(input.game, input.region);
      const otherVersions = availableVersions.filter(v => v.id !== input.currentVersion);

      const versionsWithSongs = await db
        .select({
          gameVersion: songs.gameVersion,
          count: count()
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(eq(songs.game, input.game), eq(songs.region, input.region)))
        .groupBy(songs.gameVersion);

      const versionsWithSongsSet = new Set(
        versionsWithSongs
          .filter(v => v.count > 0)
          .map(v => v.gameVersion)
      );

      const availableVersionsWithSongs = otherVersions.filter(
        version => versionsWithSongsSet.has(version.id)
      );

      return {
        availableVersions: availableVersionsWithSongs,
      };
    }),

  copySnapshotToVersion: protectedProcedure
    .input(z.object({ game: maimaiCompatibilityGameSchema,
      snapshotId: z.string(),
      region: regionSchema,
      targetVersion: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      const copied = await copySnapshotToVersion({
        game,
        userId: ctx.session.user.id,
        snapshotPublicId: input.snapshotId,
        region,
        targetVersion: input.targetVersion,
      });
      if (!copied) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      await revalidatePublicProfileForUser(game, ctx.session.user.id, [region]);
      return { success: true, ...copied };
    }),
});
