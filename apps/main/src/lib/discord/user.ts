import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import type { Region } from '@/lib/types';
import { gamePreference } from '@/server/queries/game-preferences';
import { DISCORD_GAME } from './game';

export interface DiscordUser {
  id: string;
  name: string;
  username: string | null;
  /** The dashboard region preference for the bot's game, null when none is set. */
  region: Region | null;
}

/** The account linked to a Discord user, or null when none is. */
export async function findDiscordUser(discordUserId: string): Promise<DiscordUser | null> {
  const [dbUser] = await db
    .select({ id: user.id, name: user.name, username: user.username, region: gamePreference(DISCORD_GAME, 'region') })
    .from(user)
    .innerJoin(account, eq(account.userId, user.id))
    .where(and(eq(account.accountId, discordUserId), eq(account.providerId, 'discord')))
    .limit(1);
  return dbUser ?? null;
}
