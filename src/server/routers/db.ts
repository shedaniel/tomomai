import { db } from '@/lib/db';
import { scoreData, snapshotScores, songs, userSnapshots } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { unstable_cache } from 'next/cache';
import { getEnabledRegions } from '@/lib/enabled-regions';
import { fetchTourEvents, fetchTourEventsByNames } from '@/server/queries/events';

const regionSchema = z.enum(getEnabledRegions());

export const dbRouter = router({
  getEventStepsByNames: publicProcedure
    .input(z.object({ names: z.array(z.string()).max(200) }))
    .query(async ({ input }) => {
      return fetchTourEventsByNames(input.names);
    }),
  getEvents: publicProcedure.query(async () => {
    const getCachedEvents = unstable_cache(
      async () => fetchTourEvents(),
      ['db-events'],
      { revalidate: 3600, tags: ['db-events'] }
    );
    return getCachedEvents();
  }),
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
              averageAchievement: sql<number>`AVG(${scoreData.achievement})`.mapWith(Number),
            })
            .from(snapshotScores)
            .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
            .innerJoin(songs, eq(scoreData.songId, songs.id))
            .where(
              inArray(snapshotScores.snapshotId, latestSnapshotIds)
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
              averageAchievement: sql<number>`AVG(${scoreData.achievement})`.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(snapshotScores)
            .innerJoin(scoreData, eq(snapshotScores.scoreId, scoreData.id))
            .innerJoin(songs, eq(scoreData.songId, songs.id))
            .where(
              inArray(snapshotScores.snapshotId, latestSnapshotIds)
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

          // 7. Active Users Over Time (cumulative by days)
          // Get all user activity in the last 30 days with a single query
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

          const userActivityQuery = await db
            .select({
              userId: userSnapshots.userId,
              fetchedAt: userSnapshots.fetchedAt,
            })
            .from(userSnapshots)
            .where(
              and(
                eq(userSnapshots.region, region),
                gte(userSnapshots.fetchedAt, thirtyDaysAgo)
              )
            );

          // Process the data to calculate cumulative active users
          const activeUsersOverTime = [];
          const today = new Date();

          // 1. Find the most recent activity for each user
          const lastActivityByUser = new Map<string, number>();
          userActivityQuery.forEach(activity => {
            const time = new Date(activity.fetchedAt).getTime();
            const current = lastActivityByUser.get(activity.userId) || 0;
            if (time > current) {
              lastActivityByUser.set(activity.userId, time);
            }
          });

          // 2. Bucket users by how many days ago they were last active
          // index 1 = active within last 24h (1 day)
          // index 30 = active within last 30 days (but not 29)
          const userCountsByDaysAgo = new Array(31).fill(0);

          lastActivityByUser.forEach((lastTime) => {
            const diffTime = today.getTime() - lastTime;
            // ceil to treat any activity within last 24h as 1 day ago, etc.
            // If diffTime is negative (future), treat as 1
            const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            if (diffDays <= 30) {
              userCountsByDaysAgo[diffDays]++;
            }
          });

          // 3. Calculate cumulative counts
          // users active in last N days = users active in last 1 day + ... + users active in last N days
          // Wait, logic check:
          // If I was active 1 day ago, I am active in "Last 1 day", "Last 2 days", etc.
          // If I was active 5 days ago, I am NOT active in "Last 1 day", but AM active in "Last 5 days".
          // So for "Last N days", we want sum(userCountsByDaysAgo[1...N]).

          let runningTotal = 0;
          for (let days = 1; days <= 30; days++) {
            runningTotal += userCountsByDaysAgo[days];
            activeUsersOverTime.push({
              days: days,
              count: runningTotal,
            });
          }

          // 8. Users with Fetches per Day (last 90 days)
          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 90);

          const fetchesPerDayQuery = await db
            .select({
              date: sql<string>`DATE(${userSnapshots.fetchedAt})`.as('date'),
              count: sql<number>`COUNT(DISTINCT ${userSnapshots.userId})`.mapWith(Number).as('count'),
            })
            .from(userSnapshots)
            .where(
              and(
                eq(userSnapshots.region, region),
                gte(userSnapshots.fetchedAt, sixtyDaysAgo)
              )
            )
            .groupBy(sql`DATE(${userSnapshots.fetchedAt})`)
            .orderBy(sql`DATE(${userSnapshots.fetchedAt})`);

          const fetchesPerDay = fetchesPerDayQuery.map(item => ({
            date: String(item.date),
            count: item.count,
          }));

          return {
            ratingDistribution,
            playCountDistribution,
            titleRanking,
            mostPlayedSongs,
            averageAchievementByLevel,
            ratingVsPlayCount,
            activeUsersOverTime,
            fetchesPerDay,
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
