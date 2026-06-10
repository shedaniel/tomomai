import { db } from '@/lib/db';
import { parentSong, songs } from '@/lib/db/schema-pg';
import { VersionId } from "@tomomai/catalog/metadata";
import { getSongSlug } from '@/lib/song-slug';
import { publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryAllUniqueSongs, querySongDetails } from '@/server/queries/songs';

export const songsRouter = router({
  getAllUniqueSongs: publicProcedure
    .query(async () => {
      return queryAllUniqueSongs();
    }),

  getSongDetails: publicProcedure
    .input(z.object({
      songName: z.string(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      return querySongDetails(input.songName, input.type, ctx.session?.user?.id);
    }),

  getSimpleSongDetails: publicProcedure
    .input(z.object({
      publicId: z.string(),
    }))
    .query(async ({ input }) => {
      const charts = await db
        .select({
          songName: parentSong.songName,
          artist: parentSong.artist,
          type: parentSong.type,
          genre: parentSong.genre,
          bpm: parentSong.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(eq(parentSong.publicId, input.publicId))
        .orderBy(desc(songs.gameVersion), sql`case when ${songs.region} = 'jp' then 0 else 1 end`);

      if (charts.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Song not found',
        });
      }

      const firstChart = charts[0];
      const chartWithBpm = charts.find(c => c.bpm !== null);
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion)) as VersionId;

      const slug = await getSongSlug({
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
      });

      return {
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        slug,
      };
    }),
});
