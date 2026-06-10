import { db } from '@/lib/db';
import { scoreData, snapshotScores, songs, userRecentSongs, userSnapshots } from '@/lib/db/schema-pg';
import { publicProcedure, router } from '@/lib/trpc';
import { and, desc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { unstable_cache } from 'next/cache';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
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
          // Log-spaced buckets: 10 buckets per decade (e.g. 100, 126, 158, 200, ...).
          const playCountLogBucket = sql<number>`ROUND(EXP(ROUND(LN(${latestSnapshots.totalPlayCount}::numeric) * 10) / 10.0))::int`;
          const ratingVsPlayCountQuery = await db
            .select({
              ratingBucket: sql<number>`ROUND(${latestSnapshots.rating} / 500.0) * 500`.mapWith(Number),
              playCountBucket: playCountLogBucket.mapWith(Number),
              count: sql<number>`COUNT(*)`.mapWith(Number),
            })
            .from(latestSnapshots)
            .where(gt(latestSnapshots.totalPlayCount, 0))
            .groupBy(
              sql`ROUND(${latestSnapshots.rating} / 500.0) * 500`,
              playCountLogBucket
            );

          const ratingVsPlayCount = ratingVsPlayCountQuery.map(item => ({
            ratingBucket: item.ratingBucket,
            playCountBucket: item.playCountBucket,
            count: item.count,
          }));

          // 7. Active Users Over Time — cumulative count of users whose last
          // snapshot falls within the last N days (N = 1..ACTIVE_WINDOW_DAYS).
          const ACTIVE_WINDOW_DAYS = 90;
          const windowStart = new Date();
          windowStart.setDate(windowStart.getDate() - ACTIVE_WINDOW_DAYS);

          // Aggregate per-user MAX(fetchedAt) server-side so the wire payload
          // is one row per active user instead of one row per snapshot.
          const lastActivityRows = await db
            .select({
              userId: userSnapshots.userId,
              lastAt: sql<Date>`MAX(${userSnapshots.fetchedAt})`.as("last_at"),
            })
            .from(userSnapshots)
            .where(
              and(
                eq(userSnapshots.region, region),
                gte(userSnapshots.fetchedAt, windowStart)
              )
            )
            .groupBy(userSnapshots.userId);

          const now = Date.now();
          const usersByDaysAgo = new Array(ACTIVE_WINDOW_DAYS + 1).fill(0);
          for (const { lastAt } of lastActivityRows) {
            const diffDays = Math.max(
              1,
              Math.ceil((now - new Date(lastAt).getTime()) / 86_400_000)
            );
            if (diffDays <= ACTIVE_WINDOW_DAYS) usersByDaysAgo[diffDays]++;
          }

          // Cumulative: users active in "last N days" = sum over 1..N.
          const activeUsersOverTime: { days: string; count: number }[] = [];
          let runningTotal = 0;
          for (let days = 1; days <= ACTIVE_WINDOW_DAYS; days++) {
            runningTotal += usersByDaysAgo[days];
            activeUsersOverTime.push({ days: String(days), count: runningTotal });
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

          // 9. Rating climb rate by current rating band
          // For each user with >=14 days between first and last snapshot,
          // compute rating gained per 30 days, bucketed by current (last) rating.
          const ratingClimbQuery = await db.execute<{
            band: number;
            users: number;
            avg_rating_per_30d: number;
            avg_plays_per_30d: number;
          }>(sql`
            WITH bounds AS (
              SELECT
                "userId",
                (array_agg(rating          ORDER BY "fetchedAt" ASC))[1]  AS first_r,
                (array_agg(rating          ORDER BY "fetchedAt" DESC))[1] AS last_r,
                (array_agg("totalPlayCount" ORDER BY "fetchedAt" ASC))[1]  AS first_p,
                (array_agg("totalPlayCount" ORDER BY "fetchedAt" DESC))[1] AS last_p,
                EXTRACT(EPOCH FROM (MAX("fetchedAt") - MIN("fetchedAt"))) / 86400 AS span_days
              FROM user_snapshots
              WHERE region = ${region}
              GROUP BY "userId"
            )
            SELECT
              (FLOOR(last_r / 500.0) * 500)::int AS band,
              COUNT(*)::int AS users,
              AVG((last_r - first_r) / NULLIF(span_days, 0) * 30)::float AS avg_rating_per_30d,
              AVG((last_p - first_p) / NULLIF(span_days, 0) * 30)::float AS avg_plays_per_30d
            FROM bounds
            WHERE span_days >= 14 AND last_r >= 10000
            GROUP BY band
            ORDER BY band
          `);
          const ratingClimbByBand = ratingClimbQuery.map(r => ({
            band: Number(r.band),
            users: Number(r.users),
            avgRatingPer30d: Number(r.avg_rating_per_30d) || 0,
            avgPlaysPer30d: Number(r.avg_plays_per_30d) || 0,
          }));

          // 10. New tracked players per week (first snapshot week, last 24 weeks)
          const newPlayersQuery = await db.execute<{ week: string; count: number }>(sql`
            WITH first_snap AS (
              SELECT "userId", MIN("fetchedAt") AS f
              FROM user_snapshots
              WHERE region = ${region}
              GROUP BY "userId"
            )
            SELECT
              date_trunc('week', f)::date::text AS week,
              COUNT(*)::int AS count
            FROM first_snap
            WHERE f > NOW() - INTERVAL '24 weeks'
            GROUP BY 1
            ORDER BY 1
          `);
          const newPlayersPerWeek = newPlayersQuery.map(r => ({
            week: String(r.week),
            count: Number(r.count),
          }));

          // 11. Fetch activity heatmap: completed fetches by hour × weekday (JST, last 90 days)
          const heatmapQuery = await db.execute<{ dow: number; hour: number; count: number }>(sql`
            SELECT
              EXTRACT(DOW  FROM ("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::int AS dow,
              EXTRACT(HOUR FROM ("startedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::int AS hour,
              COUNT(*)::int AS count
            FROM fetch_sessions
            WHERE region = ${region}
              AND status = 'completed'
              AND "startedAt" > NOW() - INTERVAL '90 days'
            GROUP BY 1, 2
            ORDER BY 1, 2
          `);
          const fetchActivityHeatmap = heatmapQuery.map(r => ({
            dow: Number(r.dow),
            hour: Number(r.hour),
            count: Number(r.count),
          }));

          // 12. Play activity heatmap: recent plays by hour × weekday (JST, last 90 days)
          // Region filter goes through songs.region (joined via songId).
          const playHeatmapQuery = await db.execute<{ dow: number; hour: number; count: number }>(sql`
            SELECT
              EXTRACT(DOW  FROM (urs."playedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::int AS dow,
              EXTRACT(HOUR FROM (urs."playedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::int AS hour,
              COUNT(*)::int AS count
            FROM user_recent_songs urs
            JOIN songs s ON s.id = urs."songId"
            WHERE s.region = ${region}
              AND urs."playedAt" > NOW() - INTERVAL '90 days'
            GROUP BY 1, 2
            ORDER BY 1, 2
          `);
          const playActivityHeatmap = playHeatmapQuery.map(r => ({
            dow: Number(r.dow),
            hour: Number(r.hour),
            count: Number(r.count),
          }));

          // 13. Recent plays per day (last 90 days)
          const recentPlaysPerDayQuery = await db.execute<{ date: string; count: number }>(sql`
            SELECT
              DATE((urs."playedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tokyo')::text AS date,
              COUNT(*)::int AS count
            FROM user_recent_songs urs
            JOIN songs s ON s.id = urs."songId"
            WHERE s.region = ${region}
              AND urs."playedAt" > NOW() - INTERVAL '90 days'
            GROUP BY 1
            ORDER BY 1
          `);
          const recentPlaysPerDay = recentPlaysPerDayQuery.map(r => ({
            date: String(r.date),
            count: Number(r.count),
          }));

          return {
            ratingDistribution,
            playCountDistribution,
            titleRanking,
            averageAchievementByLevel,
            ratingVsPlayCount,
            activeUsersOverTime,
            fetchesPerDay,
            recentPlaysPerDay,
            ratingClimbByBand,
            newPlayersPerWeek,
            fetchActivityHeatmap,
            playActivityHeatmap,
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
  getTopSongs: publicProcedure
    .input(z.object({
      region: regionSchema,
      window: z.enum(['all', '90d', '30d', '7d']).default('7d'),
    }))
    .query(async ({ input }) => {
      const getCached = unstable_cache(
        async (region: typeof input.region, window: typeof input.window) => {
          const days = window === '90d' ? 90 : window === '30d' ? 30 : window === '7d' ? 7 : null;
          const timeFilter = days !== null
            ? sql`AND urs."playedAt" > NOW() - (${days} || ' days')::interval`
            : sql``;

          const rows = await db.execute<{
            songName: string;
            type: 'std' | 'dx';
            difficulty: string;
            cover: string;
            artist: string;
            count: number;
            averageAchievement: number;
          }>(sql`
            SELECT
              p."songName" AS "songName",
              p."type" AS "type",
              p."difficulty" AS "difficulty",
              MAX(p."cover") AS "cover",
              MAX(p."artist") AS "artist",
              COUNT(*)::int AS "count",
              AVG(urs."archievement")::float AS "averageAchievement"
            FROM user_recent_songs urs
            JOIN songs s ON s.id = urs."songId"
            JOIN parent_song p ON p.id = s."parentId"
            WHERE s.region = ${region}
              ${timeFilter}
            GROUP BY p."songName", p."type", p."difficulty"
            ORDER BY COUNT(*) DESC
            LIMIT 20
          `);

          const totalPlays = rows.reduce((acc, r) => acc + Number(r.count), 0);

          return rows.map(r => ({
            songName: String(r.songName),
            type: r.type as 'std' | 'dx',
            difficulty: String(r.difficulty),
            cover: String(r.cover ?? ''),
            artist: String(r.artist ?? ''),
            count: Number(r.count),
            averageAchievement: Number(r.averageAchievement) || 0,
            percentage: totalPlays > 0 ? Number(r.count) / totalPlays : 0,
          }));
        },
        ['db-top-songs'],
        {
          revalidate: 21600,
          tags: ['db-top-songs'],
        }
      );

      return getCached(input.region, input.window);
    }),
});
