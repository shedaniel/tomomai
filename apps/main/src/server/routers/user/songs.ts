import { gameContextInput, validateGameInput } from "./game-input";
import { getCatalogChartsCachedForGame } from "@/server/queries/songs-cache";
import { codeToChartType } from "@/lib/maimai/codes";
import { parseSongId } from "@/lib/catalog/song-instance-id";
import { db } from '@/lib/db';
import { parentSong, songs } from '@/lib/db/schema-pg';
import { VersionId } from '@/lib/metadata';
import { getSongSlug } from '@/lib/song-slug';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryAllUniqueSongs, querySongDetails, querySongScores } from '@/server/queries/songs';

export const songsRouter = router({
  getCatalogForGame: publicProcedure
    .input(z.object({ ...gameContextInput, version: z.number().int().optional() }))
    .query(({ input }) => {
      const { game, region } = validateGameInput(input, "catalog");
      return getCatalogChartsCachedForGame(game, region, input.version);
    }),

  getAllUniqueSongs: publicProcedure
    .query(async () => {
      return queryAllUniqueSongs();
    }),

  getSongDetails: publicProcedure
    .input(z.object({ game: z.literal("maimai").default("maimai"),
      songName: z.string(),
      artist: z.string().optional(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      return querySongDetails(input.songName, input.type, ctx.session?.user?.id, input.artist);
    }),

  getSongScores: protectedProcedure
    .input(z.object({ game: z.literal("maimai").default("maimai"),
      songName: z.string(),
      artist: z.string().optional(),
      type: z.enum(['std', 'dx']),
    }))
    .query(async ({ input, ctx }) => {
      return {
        viewerId: ctx.session.user.id,
        userScores: await querySongScores(input.songName, input.type, ctx.session.user.id, input.artist),
      };
    }),

  getSimpleSongDetails: publicProcedure
    .input(z.object({ game: z.literal("maimai").default("maimai"),
      publicId: z.string(),
    }))
    .query(async ({ input }) => {
      const parsed = parseSongId(input.publicId);
      if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid song ID" });
      const charts = await db
        .select({
          songName: parentSong.songName,
          artist: parentSong.artist,
          type: sql`${parentSong.type}`.mapWith(codeToChartType).as("type"),
          genre: parentSong.genre,
          bpm: parentSong.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(
          eq(parentSong.game, "maimai"),
          eq(parentSong.publicId, parsed.parentPublicId),
          parsed.kind === "instance" ? and(eq(songs.game, "maimai"), eq(songs.region, parsed.region)) : undefined,
          parsed.kind === "instance" ? eq(songs.gameVersion, parsed.gameVersion) : undefined,
        ));

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
