import { db } from '@/lib/db';
import { user, stores, storeEdits, storeEditVotes } from '@/lib/db/schema-pg';
import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { TRPCError } from '@trpc/server';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

// Helper to update chosen edit for a store
const updateStoreChosenEdit = async (storeId: bigint) => {
  const edits = await db
    .select({
      id: storeEdits.id,
      createdAt: storeEdits.createdAt,
    })
    .from(storeEdits)
    .where(eq(storeEdits.storeId, storeId));

  if (edits.length === 0) {
    await db
      .update(stores)
      .set({ chosenEditId: null })
      .where(eq(stores.id, storeId));
    return;
  }

  const editIds = edits.map(e => e.id);
  const votes = await db
    .select({
      editId: storeEditVotes.editId,
      voteSum: sql<number>`SUM(${storeEditVotes.vote})`.mapWith(Number),
    })
    .from(storeEditVotes)
    .where(inArray(storeEditVotes.editId, editIds))
    .groupBy(storeEditVotes.editId);

  const votesMap = new Map(votes.map(v => [v.editId, v.voteSum]));

  const sortedEdits = edits.sort((a, b) => {
    const votesA = votesMap.get(a.id) || 0;
    const votesB = votesMap.get(b.id) || 0;

    if (votesA !== votesB) {
      return votesB - votesA;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const bestEdit = sortedEdits[0];

  await db
    .update(stores)
    .set({ chosenEditId: bestEdit.id })
    .where(eq(stores.id, storeId));
};

export const storeRouter = router({
  // Get all stores with their chosen edits (public)
  getStores: publicProcedure
    .query(async () => {
      const allStores = await db
        .select({
          id: stores.id,
          country: stores.country,
          area: stores.area,
          name: stores.name,
          address: stores.address,
          location: stores.location,
          chosenEditId: stores.chosenEditId,
        })
        .from(stores);

      const chosenEditIds = allStores
        .map(s => s.chosenEditId)
        .filter((id): id is bigint => id !== null);

      const edits = chosenEditIds.length > 0
        ? await db
          .select()
          .from(storeEdits)
          .where(inArray(storeEdits.id, chosenEditIds))
        : [];

      const editsMap = new Map(edits.map(edit => [edit.id, edit]));

      const storesWithEdits = allStores.map(store => {
        const chosenEdit = store.chosenEditId ? editsMap.get(store.chosenEditId) : null;

        return {
          id: store.id,
          country: store.country,
          area: store.area,
          name: store.name,
          address: store.address,
          location: store.location,
          chosenEdit: chosenEdit ? {
            name: chosenEdit.name,
            address: chosenEdit.address,
            openingHours: chosenEdit.openingHours,
            toilet: chosenEdit.toilet,
            smoke: chosenEdit.smoke,
            access: chosenEdit.access,
            status: chosenEdit.status,
            currency: chosenEdit.currency,
            games: chosenEdit.games,
            additionalInfo: chosenEdit.additionalInfo,
          } : null,
        };
      });

      return { stores: storesWithEdits };
    }),

  // Get all edits for a specific store (public)
  getStoreEdits: publicProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ input }) => {
      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .limit(1);

      const chosenEditId = store[0]?.chosenEditId;

      const edits = await db
        .select({
          id: storeEdits.id,
          userId: storeEdits.userId,
          userName: user.name,
          name: storeEdits.name,
          address: storeEdits.address,
          openingHours: storeEdits.openingHours,
          toilet: storeEdits.toilet,
          smoke: storeEdits.smoke,
          access: storeEdits.access,
          status: storeEdits.status,
          currency: storeEdits.currency,
          games: storeEdits.games,
          additionalInfo: storeEdits.additionalInfo,
          createdAt: storeEdits.createdAt,
          updatedAt: storeEdits.updatedAt,
        })
        .from(storeEdits)
        .innerJoin(user, eq(storeEdits.userId, user.id))
        .where(eq(storeEdits.storeId, input.storeId))
        .orderBy(desc(storeEdits.createdAt));

      const editIds = edits.map(e => e.id);
      const votes = editIds.length > 0 ? await db
        .select({
          editId: storeEditVotes.editId,
          voteSum: sql<number>`SUM(${storeEditVotes.vote})`.mapWith(Number),
        })
        .from(storeEditVotes)
        .where(inArray(storeEditVotes.editId, editIds))
        .groupBy(storeEditVotes.editId)
        : [];

      const votesMap = new Map(votes.map(v => [v.editId, v.voteSum]));

      return {
        edits: edits.map(edit => ({
          ...edit,
          voteCount: votesMap.get(edit.id) || 0,
          isChosen: edit.id === chosenEditId,
        })),
      };
    }),

  // Get user's vote status for store edits
  getUserStoreEditVotes: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ ctx, input }) => {
      const edits = await db
        .select({ id: storeEdits.id })
        .from(storeEdits)
        .where(eq(storeEdits.storeId, input.storeId));

      const editIds = edits.map(e => e.id);

      if (editIds.length === 0) {
        return { votes: [] };
      }

      const userVotes = await db
        .select({
          editId: storeEditVotes.editId,
          vote: storeEditVotes.vote,
        })
        .from(storeEditVotes)
        .where(
          and(
            inArray(storeEditVotes.editId, editIds),
            eq(storeEditVotes.userId, ctx.session.user.id)
          )
        );

      return {
        votes: userVotes.map(v => ({ ...v, editId: v.editId })),
      };
    }),

  // Vote on a store edit
  voteOnStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
      vote: z.enum(['upvote', 'downvote', 'remove']),
    }))
    .mutation(async ({ ctx, input }) => {
      const edit = await db
        .select({ storeId: storeEdits.storeId })
        .from(storeEdits)
        .where(eq(storeEdits.id, input.editId))
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }
      const storeId = edit[0].storeId;

      const voteValue = input.vote === 'upvote' ? 1 : input.vote === 'downvote' ? -1 : 0;

      if (input.vote === 'remove') {
        await db
          .delete(storeEditVotes)
          .where(
            and(
              eq(storeEditVotes.editId, input.editId),
              eq(storeEditVotes.userId, ctx.session.user.id)
            )
          );
      } else {
        await db
          .insert(storeEditVotes)
          .values({
            editId: input.editId,
            userId: ctx.session.user.id,
            vote: voteValue,
          })
          .onConflictDoUpdate({
            target: [storeEditVotes.userId, storeEditVotes.editId],
            set: { vote: voteValue },
          });
      }

      await updateStoreChosenEdit(storeId);

      return { success: true };
    }),

  // Get user's edit for a store
  getUserStoreEdit: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
    }))
    .query(async ({ ctx, input }) => {
      const userEdit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.storeId, input.storeId),
            eq(storeEdits.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      return {
        edit: userEdit[0] ? { ...userEdit[0], id: userEdit[0].id } : null,
      };
    }),

  // Create a new store edit
  createStoreEdit: protectedProcedure
    .input(z.object({
      storeId: z.bigint(),
      name: z.string().min(1).max(32).nullable(),
      address: z.string().min(10).max(256).nullable(),
      openingHours: z.string().nullable(),
      toilet: z.boolean().nullable(),
      smoke: z.boolean().nullable(),
      access: z.string().nullable(),
      status: z.enum(["open", "closed", "temporarily_closed"]).nullable(),
      currency: z.string(),
      games: z.record(z.string(), z.object({
        amount: z.number().int().min(0).optional(),
        price: z.number().optional(),
      })).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const existingEdit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.storeId, input.storeId),
            eq(storeEdits.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (existingEdit.length > 0) {
        const store = await db
          .select({ chosenEditId: stores.chosenEditId })
          .from(stores)
          .where(eq(stores.id, input.storeId))
          .limit(1);

        if (!store.length || store[0].chosenEditId !== existingEdit[0].id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'You already have an edit for this store. Please edit or delete your existing edit.',
          });
        }
      }

      const [newEdit] = await db
        .insert(storeEdits)
        .values({
          storeId: input.storeId,
          userId: ctx.session.user.id,
          name: input.name,
          address: input.address,
          openingHours: input.openingHours,
          toilet: input.toilet,
          smoke: input.smoke,
          access: input.access,
          status: input.status,
          currency: input.currency,
          games: input.games as any,
        })
        .returning();

      // Auto-upvote the creator's own edit
      await db.insert(storeEditVotes).values({
        editId: newEdit.id,
        userId: ctx.session.user.id,
        vote: 1,
      });

      await updateStoreChosenEdit(input.storeId);

      return { success: true, editId: newEdit.id };
    }),

  // Update an existing store edit
  updateStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
      storeId: z.bigint(),
      name: z.string().min(1).max(32).nullable(),
      address: z.string().min(10).max(256).nullable(),
      openingHours: z.string().nullable(),
      toilet: z.boolean().nullable(),
      smoke: z.boolean().nullable(),
      access: z.string().nullable(),
      status: z.enum(["open", "closed", "temporarily_closed"]).nullable(),
      currency: z.string(),
      games: z.record(z.string(), z.object({
        amount: z.number().int().min(0).optional(),
        price: z.number().optional(),
      })).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const edit = await db
        .select()
        .from(storeEdits)
        .where(
          and(
            eq(storeEdits.id, input.editId),
            eq(storeEdits.storeId, input.storeId)
          )
        )
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }

      if (edit[0].userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only edit your own submissions',
        });
      }

      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .limit(1);

      if (store.length > 0 && store[0].chosenEditId === input.editId) {
        const otherUserEdits = await db
          .select({ id: storeEdits.id })
          .from(storeEdits)
          .where(
            and(
              eq(storeEdits.storeId, input.storeId),
              sql`${storeEdits.userId} != ${ctx.session.user.id}`
            )
          );

        if (otherUserEdits.length > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot edit the chosen edit when other users have contributed',
          });
        }
      }

      await db
        .update(storeEdits)
        .set({
          name: input.name,
          address: input.address,
          openingHours: input.openingHours,
          toilet: input.toilet,
          smoke: input.smoke,
          access: input.access,
          status: input.status,
          currency: input.currency,
          games: input.games as any,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storeEdits.id, input.editId),
            eq(storeEdits.storeId, input.storeId)
          )
        );

      return { success: true };
    }),

  // Delete a store edit
  deleteStoreEdit: protectedProcedure
    .input(z.object({
      editId: z.bigint(),
    }))
    .mutation(async ({ ctx, input }) => {
      const edit = await db
        .select()
        .from(storeEdits)
        .where(eq(storeEdits.id, input.editId))
        .limit(1);

      if (edit.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Edit not found',
        });
      }

      if (edit[0].userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own submissions',
        });
      }

      const store = await db
        .select({ chosenEditId: stores.chosenEditId })
        .from(stores)
        .where(eq(stores.id, edit[0].storeId))
        .limit(1);

      if (store.length > 0 && store[0].chosenEditId === input.editId) {
        const otherUserEdits = await db
          .select({ id: storeEdits.id })
          .from(storeEdits)
          .where(
            and(
              eq(storeEdits.storeId, edit[0].storeId),
              sql`${storeEdits.userId} != ${ctx.session.user.id}`
            )
          );

        if (otherUserEdits.length > 0) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete the chosen edit when other users have contributed',
          });
        }
      }

      await db
        .delete(storeEdits)
        .where(eq(storeEdits.id, input.editId));

      await updateStoreChosenEdit(edit[0].storeId);

      return { success: true };
    }),
});
