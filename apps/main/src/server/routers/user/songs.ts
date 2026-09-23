import { gameIdSchema } from "@/lib/games/schema";
import { resolveGame, requireCapability } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import { gameContextInput, validateGameInput } from "./game-input";
import { getCatalogChartsCached } from "@/server/queries/songs-cache";
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

function resolveFrontendCatalogGame(game: CanonicalGameId) {
  const registration = resolveGame(game);
  if (!registration.enabled) throw new TRPCError({ code: "BAD_REQUEST", message: "Game is not enabled" });
  requireCapability(game, "catalog");
}

export const songsRouter = router({
  getCatalog: publicProcedure
    .input(z.object({ ...gameContextInput, version: z.number().int().optional() }))
    .query(({ input }) => {
      const { game, region } = validateGameInput(input, "catalog");
      return getCatalogChartsCached(game, region, input.version);
    }),

  getAllUniqueSongs: publicProcedure
    .input(z.object({ game: gameIdSchema }))
    .query(async ({ input }) => {
      const game = input.game;
      resolveFrontendCatalogGame(game);
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
      resolveFrontendCatalogGame(input.game);
      return querySongDetails(input.game, input.songName, input.type, ctx.session?.user?.id, input.artist, input.parentIds);
    }),

  getSongScores: protectedProcedure
    .input(z.object({ game: gameIdSchema,
      songName: z.string(),
      artist: z.string().optional(),
      parentIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{8}$/)).min(1).optional(),
      type: z.string().min(1),
    }))
    .query(async ({ input, ctx }) => {
      resolveFrontendCatalogGame(input.game);
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
      resolveFrontendCatalogGame(input.game);
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
      const earliestAddedVersion = Math.min(...charts.map(c => c.addedVersion));

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
