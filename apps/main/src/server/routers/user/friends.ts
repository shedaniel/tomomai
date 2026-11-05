import { z } from "zod";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";
import { protectedProcedure, router } from "@/lib/trpc";
import { gameOnlyProcedure } from "@/server/routers/game-procedures";
import { hideFriend, setFriendsEnabled, unhideFriends } from "@/server/services/friends/sync";
import { friendSongScores, friendsOverview, listFriends } from "@/server/services/friends/view";
import { resolveFlagsForUser } from "@/lib/flags";
import { eq } from "drizzle-orm";
import { songInputSchema } from "./songs";

export type FriendPlayerSummary = {
  username: string;
  name: string;
  image: string | null;
  displayName: string | null;
  rating: number | null;
  iconUrl: string | null;
};

const friendsOn = async (userId: string) => (await resolveFlagsForUser(userId)).friends;

export const friendsRouter = router({
  getFriends: gameOnlyProcedure(protectedProcedure, "friends")
    .query(({ ctx }) => friendsOverview(ctx.game, ctx.session.user.id)),

  /** Friends the viewer may open, highest rated first, for the command palette; null while the friends flag is off. */
  getFriendPlayers: gameOnlyProcedure(protectedProcedure, "friends")
    .query(async ({ ctx }): Promise<FriendPlayerSummary[] | null> => {
      if (!await friendsOn(ctx.session.user.id)) return null;
      const friends = await listFriends(ctx.game, ctx.session.user.id);
      return friends.flatMap(friend => friend.username ? [{
        username: friend.username,
        name: friend.name,
        image: friend.image,
        displayName: friend.player?.displayName ?? null,
        rating: friend.player?.rating ?? null,
        iconUrl: friend.player?.iconUrl ?? null,
      }] : []);
    }),

  /** Friends' best scores on one song, for the song details. */
  getSongFriendScores: gameOnlyProcedure(protectedProcedure, "friends")
    .input(songInputSchema)
    .query(async ({ ctx, input }) => {
      if (!await friendsOn(ctx.session.user.id)) return [];
      const { game: _, ...song } = input;
      return friendSongScores(ctx.game, ctx.session.user.id, song);
    }),

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
