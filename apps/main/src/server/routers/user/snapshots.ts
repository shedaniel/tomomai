import type { GameSnapshotData } from "@/lib/games/player-view";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { RANKING_BUCKET } from "@/lib/games/types";
import { maimaiCompatibilityGameSchema } from "@/lib/games/schema";
import { gameContextInput, validateGameInput } from "./game-input";
import { deleteUserSnapshot, fetchSnapshotData, fetchUserSnapshots } from "@/server/queries/snapshots";
import { codeToChartType, codeToComboStatus, codeToDifficulty, codeToSyncStatus, codeToTitleType } from "@/lib/maimai/codes";
import { db } from '@/lib/db';
import { parentSong, scoreData, snapshotRankings, snapshotScores, songs, userSnapshots } from '@/lib/db/schema-pg';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { fetchRatingHistory } from "@/server/queries/rating-history";
import { buildChartResolution, upsertScoreData, scoreDataKey, type ScoreDataValues } from "@/server/services/games/score-storage";
import { getVersionInfo, getAvailableVersions } from "@/lib/games/versions";
import { addRatingsAndSort } from '@/lib/rating-calculator';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, count, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { revalidatePublicProfileForUser } from '@/lib/profile-cache';

const regionSchema = z.enum(getEnabledRegions());

export const snapshotsRouter = router({
  getSnapshots: protectedProcedure
    .input(z.object({ ...gameContextInput }))
    .query(({ ctx, input }) => {
      const { game, region } = validateGameInput(input, "scores");
      return fetchUserSnapshots(game, ctx.session.user.id, region);
    }),
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

      const songsWithScores = await db
        .select({
          songName: parentSong.songName,
          artist: parentSong.artist,
          cover: parentSong.cover,
          difficulty: sql`${parentSong.difficulty}`.mapWith(codeToDifficulty).as("difficulty"),
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: sql`${parentSong.type}`.mapWith(codeToChartType).as("type"),
          gameVersion: songs.addedVersion,
          achievement: scoreData.scoreValue,
          dxScore: scoreData.secondaryScore,
          fc: sql`${scoreData.comboStatus}`.mapWith(codeToComboStatus).as("fc"),
          fs: sql`${scoreData.syncStatus}`.mapWith(codeToSyncStatus).as("fs"),
        })
        .from(snapshotScores)
        .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(eq(snapshotScores.game, "maimai"), eq(snapshotScores.snapshotId, snapshot[0].id)))
        .orderBy(parentSong.songName, parentSong.difficulty);

      return {
        metadata: {
          id: snapshot[0].publicId,
          displayName: snapshot[0].displayName,
          trophyType: codeToTitleType(snapshot[0].titleType),
          trophy: snapshot[0].title,
          region: snapshot[0].region,
          fetchedAt: snapshot[0].fetchedAt,
          gameVersion: getVersionInfo(input.game, snapshot[0].region, snapshot[0].gameVersion)!.name,
          rating: snapshot[0].rating,
          stars: snapshot[0].stars ?? 0,
          courseRankUrl: snapshot[0].courseRankUrl ?? "",
          classRankUrl: snapshot[0].classRankUrl ?? "",
          totalPlayCount: snapshot[0].totalPlayCount,
          currentVersionPlayCount: snapshot[0].versionPlayCount,
        },
        songs: addRatingsAndSort(songsWithScores, snapshot[0].gameVersion).map(song => ({
          ...song,
          gameVersion: getVersionInfo(input.game, snapshot[0].region, song.gameVersion)!.shortName,
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
      const availableVersions = getAvailableVersions(input.game, input.region);
      const otherVersions = availableVersions.filter(v => v.id !== input.currentVersion);

      const versionsWithSongs = await db
        .select({
          gameVersion: songs.gameVersion,
          count: count()
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(eq(songs.game, "maimai"), eq(songs.region, input.region)))
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
      const sourceSnapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.publicId, input.snapshotId),
            eq(userSnapshots.userId, ctx.session.user.id),
            and(eq(userSnapshots.game, "maimai"), eq(userSnapshots.region, input.region))
          )
        )
        .limit(1);

      if (sourceSnapshot.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      const originalSnapshot = sourceSnapshot[0];

      const newSnapshotPublicId = nanoid();
      const newFetchedAt = new Date(originalSnapshot.fetchedAt.getTime() + 1000);

      const [newSnapshot] = await db.insert(userSnapshots).values({
        game: "maimai",
        publicId: newSnapshotPublicId,
        userId: ctx.session.user.id,
        region: input.region,
        fetchedAt: newFetchedAt,
        gameVersion: input.targetVersion,
        rating: originalSnapshot.rating,
        courseRankUrl: originalSnapshot.courseRankUrl,
        classRankUrl: originalSnapshot.classRankUrl,
        stars: originalSnapshot.stars,
        versionPlayCount: 0,
        totalPlayCount: originalSnapshot.totalPlayCount,
        iconUrl: originalSnapshot.iconUrl,
        displayName: originalSnapshot.displayName,
        title: originalSnapshot.title,
        titleType: originalSnapshot.titleType,
      }).returning({ id: userSnapshots.id });

      const newSnapshotInternalId = newSnapshot.id;

      const originalScores = await db
        .select({
          parentId: songs.parentId,
          scoreValue: scoreData.scoreValue,
          secondaryScore: scoreData.secondaryScore,
          comboStatus: scoreData.comboStatus,
          syncStatus: scoreData.syncStatus,
          clearStatus: scoreData.clearStatus,
        })
        .from(snapshotScores)
        .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(eq(snapshotScores.game, "maimai"), eq(snapshotScores.snapshotId, originalSnapshot.id)));

      const { songsById } = await buildChartResolution(db, input.game, input.region, input.targetVersion);
      const targetSongLookup = new Map([...songsById.values()].map(song => [song.parentId, song.id]));

      // Build score data for target version songs
      const newScoreData: ScoreDataValues[] = [];
      for (const originalScore of originalScores) {
        const lookupKey = originalScore.parentId;
        const targetSongId = targetSongLookup.get(lookupKey);

        if (targetSongId) {
          newScoreData.push({
            songId: targetSongId,
            scoreValue: originalScore.scoreValue,
            secondaryScore: originalScore.secondaryScore,
            comboStatus: originalScore.comboStatus,
            syncStatus: originalScore.syncStatus,
            clearStatus: originalScore.clearStatus,
          });
        }
      }

      let newRating = originalSnapshot.rating;

      if (newScoreData.length > 0) {
        // Step 1: Upsert scoreData and get IDs
        const scoreDataLookup = await upsertScoreData(db, input.game, newScoreData);

        // Step 2: Build and insert junction rows
        const junctionRows: { snapshotId: number; game: "maimai"; scoreId: number }[] = [];
        for (const score of newScoreData) {
          const key = scoreDataKey(score);
          const scoreDataId = scoreDataLookup.get(key);
          if (scoreDataId) {
            junctionRows.push({ game: "maimai", snapshotId: newSnapshotInternalId, scoreId: scoreDataId });
          }
        }

        if (junctionRows.length > 0) {
          for (let i = 0; i < junctionRows.length; i += 1000) {
            await db.insert(snapshotScores).values(junctionRows.slice(i, i + 1000)).onConflictDoNothing();
          }
        }

        const adapter = GAME_REGISTRY[input.game].adapter;
        const ranked = newScoreData.map(score => {
          const song = songsById.get(score.songId)!;
          return {
            ...score, chartId: song.id.toString(), addedVersion: song.addedVersion,
            rating: adapter.calculateChartRating({ ...score, difficulty: song.difficulty, levelPrecise: song.levelPrecise }, input.targetVersion),
            scoreId: scoreDataLookup.get(scoreDataKey(score))!,
          };
        });
        const selected = adapter.selectRankings(ranked, input.targetVersion);
        newRating = [...selected.newScores, ...selected.oldScores].reduce((sum, score) => sum + score.rating, 0);
        const rankingRows = [
          ...selected.newScores.map((score, rank) => ({ game: input.game, snapshotId: newSnapshotInternalId, bucket: RANKING_BUCKET.new, rank, scoreId: score.scoreId })),
          ...selected.oldScores.map((score, rank) => ({ game: input.game, snapshotId: newSnapshotInternalId, bucket: RANKING_BUCKET.old, rank, scoreId: score.scoreId })),
        ];
        if (rankingRows.length) await db.insert(snapshotRankings).values(rankingRows).onConflictDoNothing();
      }

      await db
        .update(userSnapshots)
        .set({ rating: newRating })
        .where(eq(userSnapshots.id, newSnapshotInternalId));

      await revalidatePublicProfileForUser(input.game, ctx.session.user.id, [input.region]);
      return {
        success: true,
        newSnapshotId: newSnapshotPublicId,
        copiedScores: newScoreData.length,
        totalOriginalScores: originalScores.length,
        originalRating: originalSnapshot.rating,
        newRating: newRating,
      };
    }),
});
