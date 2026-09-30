import { db } from '@/lib/db';
import { deleteFromR2 } from '@/lib/r2';
import { userAlbums } from '@/lib/db/schema-pg';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { fetchUserAlbums, fetchAlbumStorageUsage } from '@/server/queries/albums';
import { MAX_STORAGE_BYTES } from '@/server/services/games/maimai/scores/albums/persist';
import { gameOnlyProcedure, gameProcedure } from '../game-procedures';

export const albumsRouter = router({
  getUserAlbums: gameProcedure(protectedProcedure, "albums")
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { game, region } = ctx;
      const userId = ctx.session.user.id;
      const { limit, offset } = input;

      const [{ albums, hasMore }, storage] = await Promise.all([
        fetchUserAlbums(game, userId, region, limit, offset),
        fetchAlbumStorageUsage(game, userId),
      ]);

      return {
        albums,
        hasMore,
        storage: {
          used: storage.totalUsed,
          limit: MAX_STORAGE_BYTES,
          regions: storage.byRegion,
        },
      };
    }),

  deleteAlbum: gameOnlyProcedure(protectedProcedure, "albums")
    .input(z.object({
      albumId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const album = await db
        .select({ id: userAlbums.id, imageKey: userAlbums.imageKey })
        .from(userAlbums)
        .where(and(
          eq(userAlbums.id, BigInt(input.albumId)),
          eq(userAlbums.game, ctx.game),
          eq(userAlbums.userId, ctx.session.user.id),
        ))
        .limit(1);

      if (album.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Album not found or access denied',
        });
      }

      if (album[0].imageKey) await deleteFromR2(album[0].imageKey);
      await db
        .delete(userAlbums)
        .where(eq(userAlbums.id, album[0].id));

      return { success: true };
    }),
});
