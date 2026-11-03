import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { locales, type Locale } from "@tomomai/i18n/locale";
import type { CanonicalGameId } from "@/lib/games/ids";
import { db } from "@/lib/db";
import { user, userSnapshots } from "@/lib/db/schema-pg";
import { offersCapability } from "@/lib/games/capabilities";
import { getGame } from "@/lib/games/registry";
import { clientIpFromHeaders, playerSearchLimiter } from "@/lib/security/redis-rate-limit";
import { getAllPostsMeta } from "@/lib/posts";
import { listGuides } from "@/lib/developer/guides";
import { getRegistry, routeSlug } from "@/lib/api/specs";
import { publicProcedure, router } from "@/lib/trpc";
import { GAME_SERVER_MODULES } from "@/server/services/games/registry";
import { gameOnlyProcedure } from "../game-procedures";

const MAX_PLAYERS = 8;
// A display name is read from every snapshot of the game, so it waits for a more specific query.
const MIN_DISPLAY_NAME_QUERY = 3;
// Older snapshots can match a name the player no longer uses, so more are read than are shown.
const DISPLAY_NAME_CANDIDATES = MAX_PLAYERS * 4;

export type PlayerSearchResult = {
  username: string;
  image: string | null;
  displayName: string | null;
  rating: number | null;
  iconUrl: string | null;
};

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, char => `\\${char}`);
}

// Posts and guides ship with the deployment, so a running server only has to read them once.
const documentCache = new Map<string, ReturnType<typeof readSearchDocuments>>();

async function readSearchDocuments(game: CanonicalGameId, locale: Locale) {
  const posts = offersCapability(getGame(game), "posts")
    ? getAllPostsMeta(locale).map(post => ({ title: post.title, summary: post.summary, date: post.date, href: `/db/posts/${post.slug}` }))
    : [];
  const guides = (await listGuides()).map(guide => ({ title: guide.title, summary: guide.description ?? null, href: `/developer/guides/${guide.slug}` }));
  const endpoints = getRegistry().map(spec => ({
    title: `${spec.method} ${spec.path}`,
    summary: spec.summary,
    href: `/developer/reference/${routeSlug(spec)}`,
  }));
  return { posts, guides, endpoints };
}

export const searchRouter = router({
  /**
   * Published profiles that are listed in search, by username or in-game display name. Unlisted profiles stay
   * reachable by URL but are never found here.
   */
  searchPlayers: gameOnlyProcedure(publicProcedure, "scores")
    .input(z.object({ query: z.string().trim().min(2).max(32) }))
    .query(async ({ ctx, input }): Promise<PlayerSearchResult[]> => {
      const limited = await playerSearchLimiter.check(clientIpFromHeaders(ctx.req.headers));
      if (limited.limited) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many searches, please slow down" });

      const { game } = ctx;
      const nameQuery = input.query.normalize("NFKC").toLowerCase();
      // Normalised first, so a full-width "＠ｋｕｒｏ" still reads as a username.
      const usernameQuery = nameQuery.replace(/^@/, "").replace(/[^a-z0-9_-]/g, "");
      const listed = and(eq(user.publishProfile, true), eq(user.profileShowInSearch, true), isNotNull(user.username));

      const byUsername = usernameQuery.length >= 2
        ? await db
          .select({ id: user.id, username: user.username, image: user.image })
          .from(user)
          .where(and(listed, sql`lower(${user.username}) like ${`%${escapeLike(usernameQuery)}%`}`))
          .orderBy(
            sql`lower(${user.username}) = ${usernameQuery} desc`,
            sql`lower(${user.username}) like ${`${escapeLike(usernameQuery)}%`} desc`,
            sql`length(${user.username})`,
          )
          .limit(MAX_PLAYERS)
        : [];

      const byDisplayName = nameQuery.length >= MIN_DISPLAY_NAME_QUERY && byUsername.length < MAX_PLAYERS
        ? await db
          .selectDistinctOn([userSnapshots.userId], { id: user.id, username: user.username, image: user.image })
          .from(userSnapshots)
          .innerJoin(user, eq(userSnapshots.userId, user.id))
          .where(and(
            eq(userSnapshots.game, game),
            listed,
            sql`lower(normalize(${userSnapshots.displayName}, NFKC)) like ${`%${escapeLike(nameQuery)}%`}`,
          ))
          .orderBy(userSnapshots.userId, desc(userSnapshots.fetchedAt))
          .limit(DISPLAY_NAME_CANDIDATES)
        : [];

      const seen = new Set<string>();
      const candidates = [...byUsername, ...byDisplayName].filter(row => {
        if (!row.username || seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });

      const headers = candidates.length > 0
        ? await db
          .selectDistinctOn([userSnapshots.userId], {
            userId: userSnapshots.userId,
            displayName: userSnapshots.displayName,
            rating: userSnapshots.rating,
            iconUrl: userSnapshots.iconUrl,
          })
          .from(userSnapshots)
          .where(and(eq(userSnapshots.game, game), inArray(userSnapshots.userId, candidates.map(row => row.id))))
          .orderBy(userSnapshots.userId, desc(userSnapshots.fetchedAt))
        : [];
      const headerByUser = new Map(headers.map(header => [header.userId, header]));
      // A display name matched in an older snapshot only counts while the player still goes by it.
      const usernameMatches = new Set(byUsername.map(row => row.id));
      const users = candidates.filter(row => usernameMatches.has(row.id)
        || (headerByUser.get(row.id)?.displayName.normalize("NFKC").toLowerCase().includes(nameQuery) ?? false)).slice(0, MAX_PLAYERS);

      const results: PlayerSearchResult[] = users.map(row => {
        const header = headerByUser.get(row.id);
        return {
          username: row.username!,
          image: row.image,
          displayName: header?.displayName ?? null,
          rating: header?.rating ?? null,
          iconUrl: header?.iconUrl ?? null,
        };
      });

      // The game's demo profiles have no account, so they are matched by name here.
      const reserved = GAME_SERVER_MODULES[game].reserved;
      if (reserved && usernameQuery.length >= 2) {
        for (const username of reserved.usernames) {
          if (results.length >= MAX_PLAYERS || !username.includes(usernameQuery)) continue;
          const profile = await reserved.user(username);
          if (profile) results.push({ username, image: null, displayName: profile.name, rating: null, iconUrl: null });
        }
      }
      return results;
    }),

  /** Changelog posts and developer docs the palette searches on the client. */
  getSearchDocuments: gameOnlyProcedure(publicProcedure, "catalog")
    .input(z.object({ locale: z.enum(locales as [Locale, ...Locale[]]) }))
    .query(({ ctx, input }) => {
      const key = `${ctx.game}:${input.locale}`;
      const cached = documentCache.get(key);
      if (cached) return cached;
      const documents = readSearchDocuments(ctx.game, input.locale);
      if (process.env.NODE_ENV === "production") documentCache.set(key, documents);
      return documents;
    }),
});
