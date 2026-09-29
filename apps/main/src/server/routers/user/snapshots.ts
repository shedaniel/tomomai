import type { GameSnapshotData } from "@/lib/games/player-view";
import { rateScores, sortByRating } from "@/lib/games/ranking";
import { maimaiCompatibilityGameSchema, regionSchema } from "@/lib/games/schema";
import { gameContextInput, validateGameInput } from "./game-input";
import { deleteUserSnapshot, fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, codeToTitleType } from "@/lib/games/maimai/codes";
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
      const snapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.publicId, input.snapshotId),
            eq(userSnapshots.game, input.game),
            eq(userSnapshots.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (snapshot.length === 0) {
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
        .where(and(eq(snapshotScores.game, input.game), eq(snapshotScores.snapshotId, snapshot[0].id)))
        .orderBy(parentSong.songName, parentSong.difficulty);

      return {
        metadata: {
          id: snapshot[0].publicId,
          displayName: snapshot[0].displayName,
          trophyType: codeToTitleType(snapshot[0].titleType),
          trophy: snapshot[0].title,
          region: snapshot[0].region,
          fetchedAt: snapshot[0].fetchedAt,
          gameVersion: getVersion(input.game, snapshot[0].gameVersion)?.name ?? String(snapshot[0].gameVersion),
          rating: snapshot[0].rating,
          stars: snapshot[0].stars ?? 0,
          courseRankUrl: snapshot[0].courseRankUrl ?? "",
          classRankUrl: snapshot[0].classRankUrl ?? "",
          totalPlayCount: snapshot[0].totalPlayCount,
          currentVersionPlayCount: snapshot[0].versionPlayCount,
        },
        songs: sortByRating(rateScores(input.game, scores, snapshot[0].gameVersion)).map(score => ({
          songName: score.songName,
          artist: score.artist,
          cover: score.cover,
          difficulty: codeToDifficulty(score.difficultyCode),
          level: score.level,
          levelPrecise: score.levelPrecise,
          type: codeToChartType(score.typeCode),
          gameVersion: getVersion(input.game, score.addedVersion)?.shortName ?? String(score.addedVersion),
          achievement: score.scoreValue,
          dxScore: score.secondaryScore,
          fc: codeToComboStatus(score.comboStatus),
          fs: codeToSyncStatus(score.syncStatus),
          rating: score.rating,
        })),
        iconUrl: snapshot[0].iconUrl,
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
