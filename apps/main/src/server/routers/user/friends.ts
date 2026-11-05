import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/lib/trpc";
import { gameOnlyProcedure } from "@/server/routers/game-procedures";
import { hideFriend, setFriendsEnabled, unhideFriends } from "@/server/services/friends/sync";
import { friendSongScores, friendsOverview, listFriends } from "@/server/services/friends/view";
import { resolveFlagsForUser } from "@/lib/flags";
import { songInputSchema } from "./songs";

export type FriendPlayerSummary = {
  username: string;
  name: string;
  image: string | null;
  displayName: string | null;
  rating: number | null;
  iconUrl: string | null;
};

// The friends flag only governs the viewer's own use of friends; it never changes what others see of them.
const flaggedProcedure = protectedProcedure.use(async ({ ctx, next }) =>
  next({ ctx: { friendsOn: (await resolveFlagsForUser(ctx.session.user.id)).friends } }));

const friendsProcedure = flaggedProcedure.use(({ ctx, next }) => {
  if (!ctx.friendsOn) throw new TRPCError({ code: "FORBIDDEN", message: "Friends are not enabled" });
  return next();
});

export const friendsRouter = router({
  getFriends: gameOnlyProcedure(friendsProcedure, "friends")
    .query(({ ctx }) => friendsOverview(ctx.game, ctx.session.user.id)),

  /** Friends the viewer may open, highest rated first, for the command palette; null while the friends flag is off. */
  getFriendPlayers: gameOnlyProcedure(flaggedProcedure, "friends")
    .query(async ({ ctx }): Promise<FriendPlayerSummary[] | null> => {
      if (!ctx.friendsOn) return null;
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

  /** Friends' best scores on one song, for the song details; empty while the friends flag is off. */
  getSongFriendScores: gameOnlyProcedure(flaggedProcedure, "friends")
    .input(songInputSchema)
    .query(async ({ ctx, input }) => {
      if (!ctx.friendsOn) return [];
      const { game: _, ...song } = input;
      return friendSongScores(ctx.game, ctx.session.user.id, song);
    }),

  setFriendsEnabled: friendsProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await setFriendsEnabled(ctx.session.user.id, input.enabled);
      return { success: true };
    }),

  hideFriend: gameOnlyProcedure(friendsProcedure, "friends")
    .input(z.object({ userId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!await hideFriend(ctx.game, ctx.session.user.id, input.userId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not a friend" });
      }
      return { success: true };
    }),

  unhideFriends: friendsProcedure
    .input(z.object({ userIds: z.array(z.string().min(1)).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await unhideFriends(ctx.session.user.id, input.userIds);
      return { success: true };
    }),
});
