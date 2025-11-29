import { db } from '@/lib/db';
import { songs, userScores, userSnapshots } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { unstable_cache } from 'next/cache';

const regionSchema = z.enum(['intl', 'jp']);

export const dbRouter = router({
  getStats: publicProcedure
    .input(z.object({
      region: regionSchema,
    }))
    .query(async ({ input }) => {
      const getCachedStats = unstable_cache(
        async (region: typeof input.region) => {
          // 1. Get latest snapshot for each user in the region
          // We use distinctOn to get the latest snapshot per user
          const latestSnapshots = db
            .selectDistinctOn([userSnapshots.userId], {
                id: userSnapshots.id,
                rating: userSnapshots.rating,
                totalPlayCount: userSnapshots.totalPlayCount,
                title: userSnapshots.title,
            })
            .from(userSnapshots)
            .where(eq(userSnapshots.region, region))
            .orderBy(userSnapshots.userId, desc(userSnapshots.fetchedAt))
            .as('latest_snapshots');

          // 1. Rating Distribution
          const ratingDistributionQuery = await db
            .select({
              bucket: sql<number>`ROUND(${latestSnapshots.rating} / 100.0) * 100`.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(latestSnapshots)
            .groupBy(sql`ROUND(${latestSnapshots.rating} / 100.0) * 100`)
            .orderBy(sql`ROUND(${latestSnapshots.rating} / 100.0) * 100`);

          // 2. Play Count Distribution
          const playCountDistributionQuery = await db
            .select({
              bucket: sql<number>`ROUND(${latestSnapshots.totalPlayCount} / 100.0) * 100`.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(latestSnapshots)
            .groupBy(sql`ROUND(${latestSnapshots.totalPlayCount} / 100.0) * 100`)
            .orderBy(sql`ROUND(${latestSnapshots.totalPlayCount} / 100.0) * 100`);

          // 3. Most Frequently Used Title
          const titleRankingQuery = await db
            .select({
              title: latestSnapshots.title,
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(latestSnapshots)
            .groupBy(latestSnapshots.title)
            .orderBy(desc(sql`COUNT(*)`))
            .limit(20);

          // Calculate totals for percentages
          const totalUsers = ratingDistributionQuery.reduce((acc, curr) => acc + curr.count, 0);

          // Format distributions
          const ratingDistribution = ratingDistributionQuery.map(item => ({
            bucket: item.bucket,
            percentage: totalUsers > 0 ? item.count / totalUsers : 0,
          }));

          const playCountDistribution = playCountDistributionQuery.map(item => ({
            bucket: item.bucket,
            percentage: totalUsers > 0 ? item.count / totalUsers : 0,
          }));

          const titleRanking = titleRankingQuery.map(item => ({
            title: item.title,
            percentage: totalUsers > 0 ? item.count / totalUsers : 0,
          }));

          // Subquery for latest snapshot IDs
          const latestSnapshotIds = db
            .selectDistinctOn([userSnapshots.userId], { id: userSnapshots.id })
            .from(userSnapshots)
            .where(eq(userSnapshots.region, region))
            .orderBy(userSnapshots.userId, desc(userSnapshots.fetchedAt));

          // 4. Most Played Songs
          const mostPlayedSongsQuery = await db
            .select({
              songName: songs.songName,
              type: songs.type,
              difficulty: songs.difficulty,
              cover: sql<string>`MAX(${songs.cover})`, // Just pick one cover
              artist: sql<string>`MAX(${songs.artist})`,
              count: sql<number>`COUNT(*)`.mapWith(Number),
              averageAchievement: sql<number>`AVG(${userScores.achievement})`.mapWith(Number),
            })
            .from(userScores)
            .innerJoin(songs, eq(userScores.songId, songs.id))
            .where(
                inArray(userScores.snapshotId, latestSnapshotIds)
            )
            .groupBy(songs.songName, songs.type, songs.difficulty)
            .orderBy(desc(sql`COUNT(*)`))
            .limit(20);
            
          // We calculate percentage based on total snapshots (users)
          const mostPlayedSongs = mostPlayedSongsQuery.map(item => ({
            ...item,
            percentage: totalUsers > 0 ? item.count / totalUsers : 0,
          }));

          // 5. Average Achievement by Level
          const averageAchievementByLevelQuery = await db
            .select({
              level: songs.level,
              averageAchievement: sql<number>`AVG(${userScores.achievement})`.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(userScores)
            .innerJoin(songs, eq(userScores.songId, songs.id))
            .where(
                inArray(userScores.snapshotId, latestSnapshotIds)
            )
            .groupBy(songs.level)
            .orderBy(songs.level);

          const averageAchievementByLevel = averageAchievementByLevelQuery.map(item => ({
            level: item.level,
            averageAchievement: item.averageAchievement,
          }));

          // 6. Average Rating vs Play Count Heatmap
          // Group ratings into 500 buckets and play counts into 1000 buckets
          const ratingVsPlayCountQuery = await db
            .select({
              ratingBucket: sql<number>`ROUND(${latestSnapshots.rating} / 500.0) * 500`.mapWith(Number),
              playCountBucket: sql<number>`ROUND(${latestSnapshots.totalPlayCount} / 100.0) * 100`.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(latestSnapshots)
            .where(gt(latestSnapshots.totalPlayCount, 0))
            .groupBy(
              sql`ROUND(${latestSnapshots.rating} / 500.0) * 500`,
              sql`ROUND(${latestSnapshots.totalPlayCount} / 100.0) * 100`
            );

          const ratingVsPlayCount = ratingVsPlayCountQuery.map(item => ({
            ratingBucket: item.ratingBucket,
            playCountBucket: item.playCountBucket,
            count: item.count,
          }));

          return {
            ratingDistribution,
            playCountDistribution,
            titleRanking,
            mostPlayedSongs,
            averageAchievementByLevel,
            ratingVsPlayCount,
            totalUsers: 0, // Hide actual count
          };
        },
        ['db-stats'],
        {
          revalidate: 21600, // 6 hours
          tags: ['db-stats']
        }
      );

      return getCachedStats(input.region);
    }),
});
