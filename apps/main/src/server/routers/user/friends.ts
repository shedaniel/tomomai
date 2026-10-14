import { z } from "zod";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { protectedProcedure, router } from "@/lib/trpc";
import { gameOnlyProcedure } from "@/server/routers/game-procedures";
import { hideFriend, setFriendsEnabled, unhideFriends } from "@/server/services/friends/sync";
import { friendsOverview } from "@/server/services/friends/view";
import { eq } from "drizzle-orm";

export const friendsRouter = router({
  getFriends: gameOnlyProcedure(protectedProcedure, "friends")
    .query(({ ctx }) => friendsOverview(ctx.game, ctx.session.user.id)),

  setFriendsEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setFriendsEnabled(ctx.session.user.id, input.enabled);
      return { success: true };
    }),

  updateFriendSharing: protectedProcedure
    .input(z.object({ profileShareWithFriends: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(user)
        .set({ profileShareWithFriends: input.profileShareWithFriends, updatedAt: new Date() })
        .where(eq(user.id, ctx.session.user.id));
      return { success: true };
    }),

  hideFriend: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await hideFriend(ctx.session.user.id, input.userId);
      return { success: true };
    }),

  unhideFriends: protectedProcedure
    .input(z.object({ userIds: z.array(z.string().min(1)).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await unhideFriends(ctx.session.user.id, input.userIds);
      return { success: true };
    }),
});
