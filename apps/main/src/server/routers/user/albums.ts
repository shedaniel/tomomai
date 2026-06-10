import { db } from '@/lib/db';
import { deleteFromR2 } from '@/lib/r2';
import { userAlbums } from '@/lib/db/schema-pg';
import { protectedProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getEnabledRegions } from "@tomomai/catalog/enabled-regions";
import { fetchUserAlbums, fetchAlbumStorageUsage } from '@/server/queries/albums';

const regionSchema = z.enum(getEnabledRegions());

export const albumsRouter = router({
  getUserAlbums: protectedProcedure
    .input(z.object({
      region: regionSchema,
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { region, limit, offset } = input;

      const { albums, hasMore } = await fetchUserAlbums(userId, region, limit, offset);
      const storage = await fetchAlbumStorageUsage(userId);

      const storageLimit = 25 * 1024 * 1024; // 25MB

      return {
        albums,
        hasMore,
        storage: {
          used: storage.totalUsed,
          intlUsed: storage.intlUsed,
          jpUsed: storage.jpUsed,
          limit: storageLimit,
          percentage: (storage.totalUsed / storageLimit) * 100,
          intlPercentage: (storage.intlUsed / storageLimit) * 100,
          jpPercentage: (storage.jpUsed / storageLimit) * 100,
        },
      };
    }),

  deleteAlbum: protectedProcedure
    .input(z.object({
      albumId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const album = await db
        .select({ id: userAlbums.id, imageKey: userAlbums.imageKey })
        .from(userAlbums)
        .where(
          and(
            eq(userAlbums.id, BigInt(input.albumId)),
            eq(userAlbums.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (album.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Album not found or access denied',
        });
      }

      await deleteFromR2(album[0].imageKey);
      await db
        .delete(userAlbums)
        .where(eq(userAlbums.id, album[0].id));

      return { success: true };
    }),
});
