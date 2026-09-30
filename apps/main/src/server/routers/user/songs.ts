import { gameIdSchema } from "@/lib/games/schema";
import { hasCapability } from "@/lib/games/access";
import { gameOnlyProcedure } from "../game-procedures";
import { isCodeKey, keyOf } from "@/lib/games/codes";
import { parentPublicIdSchema, parseSongId } from "@/lib/catalog/song-instance-id";
import { db } from '@/lib/db';
import { parentSong, songs } from '@/lib/db/schema-pg';
import { formatSongSlug, getSongSlug } from '@/lib/song-slug';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryAllUniqueSongs, querySongDetails, querySongScores } from '@/server/queries/songs';

// Declares the game again so the chart type can be checked against it.
const songInputSchema = z.object({
  game: gameIdSchema,
  songName: z.string(),
  artist: z.string().optional(),
  parentIds: z.array(parentPublicIdSchema).min(1).optional(),
  type: z.string(),
}).refine(input => isCodeKey(input.game, "chartType", input.type), { message: "Unknown chart type", path: ["type"] });

export const songsRouter = router({
  getAllUniqueSongs: gameOnlyProcedure(publicProcedure, "catalog")
    .query(({ ctx }) => {
      return queryAllUniqueSongs(ctx.game);
    }),

  getSongDetails: gameOnlyProcedure(publicProcedure, "catalog")
    .input(songInputSchema)
    .query(({ input, ctx }) => {
      const userId = hasCapability(ctx.game, "scores") ? ctx.session?.user?.id : undefined;
      return querySongDetails({ ...input, game: ctx.game, userId });
    }),

  getSongScores: gameOnlyProcedure(protectedProcedure, "scores")
    .input(songInputSchema)
    .query(async ({ input, ctx }) => {
      return {
        viewerId: ctx.session.user.id,
        userScores: await querySongScores({ ...input, game: ctx.game, userId: ctx.session.user.id }),
      };
    }),

  getSimpleSongDetails: gameOnlyProcedure(publicProcedure, "catalog")
    .input(z.object({
      publicId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const { game } = ctx;
      const parsed = parseSongId(input.publicId);
      if (!parsed) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid song ID" });
      const charts = await db
        .select({
          disambiguator: parentSong.disambiguator,
          songName: parentSong.songName,
          artist: parentSong.artist,
          type: sql`${parentSong.type}`.mapWith(value => keyOf(game, "chartType", Number(value))).as("type"),
          genre: parentSong.genre,
          bpm: parentSong.bpm,
          addedVersion: songs.addedVersion,
        })
        .from(songs)
        .innerJoin(parentSong, eq(songs.parentId, parentSong.id))
        .where(and(
          eq(parentSong.game, game),
          eq(parentSong.publicId, parsed.parentPublicId),
          ...(parsed.kind === "instance" ? [eq(songs.game, game), eq(songs.region, parsed.region), eq(songs.gameVersion, parsed.gameVersion)] : []),
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
        songName: firstChart.songName,
        artist: firstChart.artist,
        type: firstChart.type,
        genre: firstChart.genre,
        bpm: chartWithBpm?.bpm ?? null,
        addedVersion: earliestAddedVersion,
        slug: formatSongSlug(slug, firstChart.disambiguator),
      };
    }),
});
