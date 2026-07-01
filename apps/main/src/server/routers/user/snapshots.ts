import { db } from '@/lib/db';
import { scoreData, snapshotB50, snapshotScores, songs, user, userEvents, userSnapshots } from '@/lib/db/schema-pg';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { logger } from '@/lib/logger';
import { upsertScoreData } from '@/lib/maimai';
import { deleteUserSnapshot } from '@/server/queries/snapshots';
import { getVersionInfo, VersionId, VERSIONS } from '@/lib/metadata';
import { addRatingsAndSort, RatingCalculationInput, splitSongs } from '@/lib/rating-calculator';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { Difficulty, SongWithScore } from '@/lib/types';
import { resolvePublicUserByUsername } from '@/server/queries/public-access';
import { getReservedPublicUser, getReservedSnapshotData, getReservedSnapshots } from '@/server/queries/reserved';
import { fetchLatestSnapshotData, fetchSnapshotData, fetchUserSnapshots } from '@/server/queries/snapshots';
import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';

const regionSchema = z.enum(getEnabledRegions());

export const snapshotsRouter = router({
  getSnapshots: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      const snapshots = await fetchUserSnapshots(ctx.session.user.id, input.region);
      return { snapshots };
    }),

  getRatingHistory: protectedProcedure
    .input(z.object({ region: regionSchema }))
    .query(async ({ ctx, input }) => {
      const startTime = Date.now();
      logger.info(`Starting getRatingHistory for user ${ctx.session.user.id}, region ${input.region}`);

      const snapshotsStart = Date.now();
      const snapshots = await db
        .select({
          internalId: userSnapshots.id,
          fetchedAt: userSnapshots.fetchedAt,
          rating: userSnapshots.rating,
          gameVersion: userSnapshots.gameVersion,
        })
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.userId, ctx.session.user.id),
            eq(userSnapshots.region, input.region)
          )
        )
        .orderBy(userSnapshots.fetchedAt);
      logger.info(`Fetched ${snapshots.length} snapshots in ${Date.now() - snapshotsStart}ms`);

      if (snapshots.length < 2) {
        logger.info(`Completed in ${Date.now() - startTime}ms (insufficient data)`);
        return {
          history: snapshots.map(s => ({
            date: s.fetchedAt,
            rating: s.rating,
            changes: [],
          }))
        };
      }

      const dateGroupingStart = Date.now();
      const snapshotsByDate = new Map<string, typeof snapshots>();
      for (const snapshot of snapshots) {
        const dateKey = snapshot.fetchedAt.toISOString().split('T')[0];
        if (!snapshotsByDate.has(dateKey)) {
          snapshotsByDate.set(dateKey, []);
        }
        snapshotsByDate.get(dateKey)!.push(snapshot);
      }

      const dateGroups = Array.from(snapshotsByDate.entries())
        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
        .map(([date, snapshots]) => ({
          date,
          lastSnapshot: snapshots[snapshots.length - 1],
          allSnapshots: snapshots,
        }));
      logger.info(`Grouped ${snapshots.length} snapshots into ${dateGroups.length} date groups in ${Date.now() - dateGroupingStart}ms`);

      const snapshotsNeedingScores = new Set<number>();
      for (let i = 0; i < dateGroups.length; i++) {
        const currentGroup = dateGroups[i];

        if (i === 0) {
          snapshotsNeedingScores.add(currentGroup.lastSnapshot.internalId);
        } else {
          const prevGroup = dateGroups[i - 1];
          if (currentGroup.lastSnapshot.rating > prevGroup.lastSnapshot.rating) {
            snapshotsNeedingScores.add(currentGroup.lastSnapshot.internalId);
            snapshotsNeedingScores.add(prevGroup.lastSnapshot.internalId);
          }
        }
      }
      logger.info(`Need scores for ${snapshotsNeedingScores.size} snapshots (out of ${snapshots.length} total)`);

      const scoresStart = Date.now();
      const relevantSnapshotIds = Array.from(snapshotsNeedingScores);
      const allScores = await db
        .select({
          snapshotId: snapshotB50.snapshotId,
          songId: songs.id,
          songName: songs.songName,
          cover: songs.cover,
          difficulty: songs.difficulty,
          levelPrecise: songs.levelPrecise,
          addedVersion: songs.addedVersion,
          achievement: scoreData.achievement,
          fc: scoreData.fc,
        })
        .from(snapshotB50)
        .innerJoin(scoreData, eq(snapshotB50.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .where(
          and(
            eq(songs.region, input.region),
            inArray(snapshotB50.snapshotId, relevantSnapshotIds)
          )
        );
      logger.info(`Fetched ${allScores.length} B50 scores in ${Date.now() - scoresStart}ms`);

      const groupingStart = Date.now();
      const scoresBySnapshot = new Map<number, Array<{
        songId: bigint;
        songName: string;
        cover: string;
        difficulty: Difficulty;
        levelPrecise: number;
        addedVersion: VersionId;
        achievement: number;
        fc: RatingCalculationInput["fc"];
      }>>();
      for (const score of allScores) {
        if (!scoresBySnapshot.has(score.snapshotId)) {
          scoresBySnapshot.set(score.snapshotId, []);
        }
        scoresBySnapshot.get(score.snapshotId)!.push({
          songId: score.songId,
          songName: score.songName,
          cover: score.cover,
          difficulty: score.difficulty,
          levelPrecise: score.levelPrecise,
          addedVersion: score.addedVersion as VersionId,
          achievement: score.achievement,
          fc: score.fc,
        });
      }
      logger.info(`Grouped scores in ${Date.now() - groupingStart}ms`);

      const comparisonStart = Date.now();
      const historyWithChanges = [];
      let comparisonsPerformed = 0;

      for (let i = 0; i < snapshots.length; i++) {
        const snapshot = snapshots[i];
        const dateKey = snapshot.fetchedAt.toISOString().split('T')[0];
        const dateGroupIndex = dateGroups.findIndex(g => g.date === dateKey);
        const isLastOfGroup = dateGroups[dateGroupIndex]?.lastSnapshot.internalId === snapshot.internalId;

        const changes: Array<{
          songName: string;
          cover: string;
          difficulty: string;
          oldRating?: number;
          newRating: number;
          changeType: 'new' | 'improved';
        }> = [];

        if (isLastOfGroup && dateGroupIndex > 0) {
          const prevDateGroup = dateGroups[dateGroupIndex - 1];
          const prevSnapshot = prevDateGroup.lastSnapshot;

          if (snapshot.rating > prevSnapshot.rating) {
            const currentSongs = scoresBySnapshot.get(snapshot.internalId) || [];
            const prevSongs = scoresBySnapshot.get(prevSnapshot.internalId) || [];

            if (currentSongs.length > 0 && prevSongs.length > 0) {
              comparisonsPerformed++;
              const currentTop50 = splitSongs(currentSongs, snapshot.gameVersion);
              const prevTop50 = splitSongs(prevSongs, prevSnapshot.gameVersion);

              const currentB50 = [...currentTop50.newSongsB15, ...currentTop50.oldSongsB35];
              const prevB50 = [...prevTop50.newSongsB15, ...prevTop50.oldSongsB35];

              const prevB50Map = new Map(
                prevB50.map(song => [`${song.songId}-${song.difficulty}`, song.rating])
              );

              for (const song of currentB50) {
                const key = `${song.songId}-${song.difficulty}`;
                const prevRating = prevB50Map.get(key);

                if (prevRating === undefined) {
                  changes.push({
                    songName: song.songName,
                    cover: song.cover,
                    difficulty: song.difficulty,
                    newRating: song.rating,
                    changeType: 'new',
                  });
                } else if (song.rating > prevRating) {
                  changes.push({
                    songName: song.songName,
                    cover: song.cover,
                    difficulty: song.difficulty,
                    oldRating: prevRating,
                    newRating: song.rating,
                    changeType: 'improved',
                  });
                }
              }
            }
          }
        }

        historyWithChanges.push({
          date: snapshot.fetchedAt,
          rating: snapshot.rating,
          changes,
        });
      }
      logger.info(`Performed ${comparisonsPerformed} comparisons in ${Date.now() - comparisonStart}ms`);
      logger.info(`Total completed in ${Date.now() - startTime}ms`);

      return { history: historyWithChanges };
    }),

  getSnapshotData: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema
    }))
    .query(async ({ ctx, input }) => {
      const result = await fetchSnapshotData(ctx.session.user.id, input.snapshotId, input.region);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }

      return {
        snapshot: {
          ...result.snapshot,
          publicId: undefined,
          id: result.snapshot.publicId,
          gameVersion: result.snapshot.gameVersion as VersionId,
        },
        songs: result.songs as (Omit<typeof result.songs[number], 'addedVersion'> & {
          addedVersion: VersionId
        })[],
        events: result.events,
      };
    }),

  getPublicSnapshots: publicProcedure
    .input(z.object({
      username: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      const reservedSnapshots = await getReservedSnapshots(input.username, input.region);
      if (reservedSnapshots) return { snapshots: reservedSnapshots };

      const userData = await resolvePublicUserByUsername(input.username);

      const snapshots = await fetchUserSnapshots(userData.id, input.region, { limit: 1 });

      const filteredSnapshots = snapshots.map(snapshot => ({
        ...snapshot,
        versionPlayCount: userData.profileShowPlayCounts ? snapshot.versionPlayCount : 0,
        totalPlayCount: userData.profileShowPlayCounts ? snapshot.totalPlayCount : 0,
      }));

      return { snapshots: filteredSnapshots };
    }),

  getPublicSnapshotData: publicProcedure
    .input(z.object({
      username: z.string(),
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      const reservedData = await getReservedSnapshotData(input.username, input.region);
      if (reservedData) {
        const reservedUser = getReservedPublicUser(input.username)!;
        return {
          snapshot: {
            ...reservedData.snapshot,
            publicId: undefined,
            id: reservedData.snapshot.publicId,
            gameVersion: reservedData.snapshot.gameVersion as VersionId,
          },
          songs: reservedData.songs.map((s) => ({
            ...s,
            addedVersion: s.addedVersion as VersionId,
          })),
          privacySettings: {
            showPlayCounts: reservedUser.profileShowPlayCounts,
            showPlates: reservedUser.profileShowPlates,
            showEvents: reservedUser.profileShowEvents,
            showAllScores: reservedUser.profileShowAllScores,
            showScoreDetails: reservedUser.profileShowScoreDetails,
          },
        };
      }

      const userData = await resolvePublicUserByUsername(input.username);

      const result = await fetchLatestSnapshotData(userData.id, input.region);

      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No data available for this region',
        });
      }

      const { snapshot, songs: songsWithScores, events } = result;

      const songsForCalculation: SongWithScore[] = songsWithScores.map(song => ({
        songId: song.songId,
        songName: song.songName,
        artist: song.artist,
        cover: song.cover,
        difficulty: song.difficulty,
        level: song.level,
        levelPrecise: song.levelPrecise,
        type: song.type,
        genre: song.genre,
        addedVersion: song.addedVersion as VersionId,
        achievement: song.achievement,
        dxScore: song.dxScore,
        fc: song.fc,
        fs: song.fs,
      }));

      let filteredSongs = songsWithScores;

      if (!userData.profileShowAllScores) {
        const { newSongsB15, oldSongsB35 } = splitSongs(songsForCalculation, snapshot.gameVersion);
        const bestSongs = [...newSongsB15, ...oldSongsB35];
        const bestSongIds = new Set(bestSongs.map(song => song.songId));
        filteredSongs = songsWithScores.filter(song => bestSongIds.has(song.songId));
      }

      const filteredEvents = userData.profileShowEvents ? events : undefined;

      return {
        snapshot: {
          ...snapshot,
          publicId: undefined,
          id: snapshot.publicId,
          gameVersion: snapshot.gameVersion as VersionId,
        },
        songs: filteredSongs as (Omit<typeof filteredSongs[number], "addedVersion"> & { addedVersion: VersionId })[],
        privacySettings: {
          showPlayCounts: userData.profileShowPlayCounts,
          showPlates: userData.profileShowPlates,
          showEvents: userData.profileShowEvents,
          showAllScores: userData.profileShowAllScores,
          showScoreDetails: userData.profileShowScoreDetails,
        },
        ...(filteredEvents && { events: filteredEvents }),
      };
    }),

  deleteSnapshot: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
      region: regionSchema
    }))
    .mutation(async ({ ctx, input }) => {
      const { deleted } = await deleteUserSnapshot(
        ctx.session.user.id,
        input.snapshotId,
        input.region,
      );
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Snapshot not found or access denied',
        });
      }
      return { success: true };
    }),

  exportSnapshotData: protectedProcedure
    .input(z.object({
      snapshotId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const snapshot = await db
        .select()
        .from(userSnapshots)
        .where(
          and(
            eq(userSnapshots.publicId, input.snapshotId),
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
          songName: songs.songName,
          artist: songs.artist,
          cover: songs.cover,
          difficulty: songs.difficulty,
          level: songs.level,
          levelPrecise: songs.levelPrecise,
          type: songs.type,
          gameVersion: songs.addedVersion,
          achievement: scoreData.achievement,
          dxScore: scoreData.dxScore,
          fc: scoreData.fc,
          fs: scoreData.fs,
        })
        .from(snapshotScores)
        .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .where(eq(snapshotScores.snapshotId, snapshot[0].id))
        .orderBy(songs.songName, songs.difficulty);

      return {
        metadata: {
          id: snapshot[0].publicId,
          displayName: snapshot[0].displayName,
          trophyType: snapshot[0].titleType,
          trophy: snapshot[0].title,
          region: snapshot[0].region,
          fetchedAt: snapshot[0].fetchedAt,
          gameVersion: getVersionInfo(snapshot[0].gameVersion as VersionId)!.name,
          rating: snapshot[0].rating,
          stars: snapshot[0].stars,
          courseRankUrl: snapshot[0].courseRankUrl,
          classRankUrl: snapshot[0].classRankUrl,
          totalPlayCount: snapshot[0].totalPlayCount,
          currentVersionPlayCount: snapshot[0].versionPlayCount,
        },
        songs: addRatingsAndSort(songsWithScores, snapshot[0].gameVersion as VersionId).map(song => ({
          ...song,
          gameVersion: getVersionInfo(song.gameVersion as VersionId)!.shortName,
        })),
        iconUrl: snapshot[0].iconUrl,
      };
    }),

  getAvailableVersionsForCopy: protectedProcedure
    .input(z.object({
      region: regionSchema,
      currentVersion: z.number(),
    }))
    .query(async ({ input }) => {
      const availableVersions = VERSIONS;
      const otherVersions = availableVersions.filter(v => v.id !== input.currentVersion);

      const versionsWithSongs = await db
        .select({
          gameVersion: songs.gameVersion,
          count: count()
        })
        .from(songs)
        .where(eq(songs.region, input.region))
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
    .input(z.object({
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
            eq(userSnapshots.region, input.region)
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
      }).returning({ id: userSnapshots.id });

      const newSnapshotInternalId = newSnapshot.id;

      const originalScores = await db
        .select({
          songName: songs.songName,
          songType: songs.type,
          songDifficulty: songs.difficulty,
          achievement: scoreData.achievement,
          dxScore: scoreData.dxScore,
          fc: scoreData.fc,
          fs: scoreData.fs,
        })
        .from(snapshotScores)
        .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
        .innerJoin(songs, eq(scoreData.songId, songs.id))
        .where(eq(snapshotScores.snapshotId, originalSnapshot.id));

      const targetVersionSongs = await db
        .select({
          id: songs.id,
          songName: songs.songName,
          type: songs.type,
          difficulty: songs.difficulty,
        })
        .from(songs)
        .where(
          and(
            eq(songs.region, input.region),
            eq(songs.gameVersion, input.targetVersion)
          )
        );

      const targetSongLookup = new Map<string, bigint>();
      for (const song of targetVersionSongs) {
        const key = `${song.songName}|${song.type}|${song.difficulty}`;
        targetSongLookup.set(key, song.id);
      }

      // Build score data for target version songs
      const newScoreData: { songId: bigint; achievement: number; dxScore: number; fc: string; fs: string }[] = [];
      for (const originalScore of originalScores) {
        const lookupKey = `${originalScore.songName}|${originalScore.songType}|${originalScore.songDifficulty}`;
        const targetSongId = targetSongLookup.get(lookupKey);

        if (targetSongId) {
          newScoreData.push({
            songId: targetSongId,
            achievement: originalScore.achievement,
            dxScore: originalScore.dxScore,
            fc: originalScore.fc,
            fs: originalScore.fs,
          });
        }
      }

      let newRating = originalSnapshot.rating;

      if (newScoreData.length > 0) {
        // Step 1: Upsert scoreData and get IDs
        const scoreDataLookup = await upsertScoreData(newScoreData);

        // Step 2: Build and insert junction rows
        const junctionRows: { snapshotId: number; scoreId: number }[] = [];
        for (const score of newScoreData) {
          const key = `${score.songId}-${score.achievement}-${score.dxScore}-${score.fc}-${score.fs}`;
          const scoreDataId = scoreDataLookup.get(key);
          if (scoreDataId) {
            junctionRows.push({ snapshotId: newSnapshotInternalId, scoreId: scoreDataId });
          }
        }

        if (junctionRows.length > 0) {
          for (let i = 0; i < junctionRows.length; i += 1000) {
            await db.insert(snapshotScores).values(junctionRows.slice(i, i + 1000)).onConflictDoNothing();
          }
        }

        // Step 3: Read back with full song data for B50 calculation
        const scoresWithSongs = await db
          .select({
            songId: songs.id,
            songName: songs.songName,
            artist: songs.artist,
            cover: songs.cover,
            difficulty: songs.difficulty,
            level: songs.level,
            levelPrecise: songs.levelPrecise,
            type: songs.type,
            genre: songs.genre,
            addedVersion: songs.addedVersion,
            achievement: scoreData.achievement,
            dxScore: scoreData.dxScore,
            fc: scoreData.fc,
            fs: scoreData.fs,
          })
          .from(snapshotScores)
          .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
          .innerJoin(songs, eq(scoreData.songId, songs.id))
          .where(eq(snapshotScores.snapshotId, newSnapshotInternalId));

        const songsForCalculation: (Omit<SongWithScore, 'songId'> & { songId: bigint })[] = scoresWithSongs.map(song => ({
          songId: song.songId,
          songName: song.songName,
          artist: song.artist,
          cover: song.cover,
          difficulty: song.difficulty,
          level: song.level,
          levelPrecise: song.levelPrecise,
          type: song.type,
          genre: song.genre,
          addedVersion: song.addedVersion as VersionId,
          achievement: song.achievement,
          dxScore: song.dxScore,
          fc: song.fc,
          fs: song.fs,
        }));

        // Step 4: Compute B50 and insert
        const { newSongsB15, oldSongsB35 } = splitSongs(songsForCalculation, input.targetVersion);

        const ratingContributingSongs = [...newSongsB15, ...oldSongsB35];
        newRating = ratingContributingSongs.reduce((sum, song) => sum + song.rating, 0);

        const b50Rows: { snapshotId: number; rank: number; scoreId: number }[] = [];

        for (let i = 0; i < newSongsB15.length; i++) {
          const song = newSongsB15[i];
          const key = `${song.songId}-${song.achievement}-${song.dxScore}-${song.fc}-${song.fs}`;
          const scoreDataId = scoreDataLookup.get(key);
          if (scoreDataId) {
            b50Rows.push({ snapshotId: newSnapshotInternalId, rank: i, scoreId: scoreDataId });
          }
        }

        for (let i = 0; i < oldSongsB35.length; i++) {
          const song = oldSongsB35[i];
          const key = `${song.songId}-${song.achievement}-${song.dxScore}-${song.fc}-${song.fs}`;
          const scoreDataId = scoreDataLookup.get(key);
          if (scoreDataId) {
            b50Rows.push({ snapshotId: newSnapshotInternalId, rank: 15 + i, scoreId: scoreDataId });
          }
        }

        if (b50Rows.length > 0) {
          await db.insert(snapshotB50).values(b50Rows).onConflictDoNothing();
        }
      }

      await db
        .update(userSnapshots)
        .set({ rating: newRating })
        .where(eq(userSnapshots.id, newSnapshotInternalId));

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
