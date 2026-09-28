import { gameIdSchema } from "@/lib/games/schema";
import { resolveGame } from "@/lib/games/registry";
import { validateGameCapability } from "./game-input";
import { getGameChartTypeKey } from "@/lib/games/presentation";
import { parseSongId } from "@/lib/catalog/song-instance-id";
import { db } from '@/lib/db';
import { parentSong, songs } from '@/lib/db/schema-pg';
import { getSongSlug } from '@/lib/song-slug';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryAllUniqueSongs, querySongDetails, querySongScores } from '@/server/queries/songs';

export const songsRouter = router({
  getAllUniqueSongs: publicProcedure
    .input(z.object({ game: gameIdSchema }))
    .query(async ({ input }) => {
      const game = input.game;
      validateGameCapability(game, "catalog");
      return queryAllUniqueSongs(game);
    }),

  getSongDetails: publicProcedure
    .input(z.object({ game: gameIdSchema,
      songName: z.string(),
      artist: z.string().optional(),
      parentIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{8}$/)).min(1).optional(),
      type: z.string().min(1),
    }))
    .query(async ({ input, ctx }) => {
      validateGameCapability(input.game, "catalog");
      const userId = resolveGame(input.game).enabled ? ctx.session?.user?.id : undefined;
      return querySongDetails(input.game, input.songName, input.type, userId, input.artist, input.parentIds);
    }),

  getSongScores: protectedProcedure
    .input(z.object({ game: gameIdSchema,
      songName: z.string(),
      artist: z.string().optional(),
      parentIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{8}$/)).min(1).optional(),
      type: z.string().min(1),
    }))
    .query(async ({ input, ctx }) => {
      validateGameCapability(input.game, "scores");
      return {
        viewerId: ctx.session.user.id,
        userScores: await querySongScores(input.game, input.songName, input.type, ctx.session.user.id, input.artist, input.parentIds),
      };
    }),

  getSimpleSongDetails: publicProcedure
    .input(z.object({ game: gameIdSchema,
      publicId: z.string(),
    }))
    .query(async ({ input }) => {
      validateGameCapability(input.game, "catalog");
      const parsed = parseSongId(input.publicId);
      if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid song ID" });
      const charts = await db
        .select({
          region: songs.region,
          disambiguator: parentSong.disambiguator,
          songName: parentSong.songName,
          artist: parentSong.artist,
          type: sql`${parentSong.type}`.mapWith(value => getGameChartTypeKey(input.game, Number(value))).as("type"),
          genre: parentSong.genre,
          bpm: parentSong.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(
          eq(parentSong.game, input.game),
          eq(parentSong.publicId, parsed.parentPublicId),
          parsed.kind === "instance" ? and(eq(songs.game, input.game), eq(songs.region, parsed.region)) : undefined,
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
      const earliestAddedVersion = Math.min(...charts.map(chart => chart.addedVersion));

      const slug = await getSongSlug({
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
      });

      return {
        region: firstChart.region,
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        slug: firstChart.disambiguator ? `${slug}-${firstChart.disambiguator}` : slug,
      };
    }),
});
