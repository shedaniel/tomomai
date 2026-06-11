import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { resolveRegion } from '../region';
import { generateAndSendDailyPlaysImage } from '../image-utils';
import { listDailyPlaysAvailableDays } from '@/server/services/daily-plays-data';

async function findDbUserByDiscordId(discordUserId: string) {
  const [dbUser] = await db
    .select({ id: user.id, region: user.region })
    .from(user)
    .innerJoin(account, eq(account.userId, user.id))
    .where(and(
      eq(account.accountId, discordUserId),
      eq(account.providerId, 'discord')
    ))
    .limit(1);
  return dbUser;
}

export interface DailyCommandOptions {
  discordUserId: string;
  regionParam?: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
}

export async function handleDailyCommand({
  discordUserId,
  regionParam,
  day,
  applicationId,
  interactionToken,
}: DailyCommandOptions): Promise<DiscordResponse> {
  try {
    if (!discordUserId) {
      return createErrorResponse('Unable to identify Discord user. Please try again.');
    }

    const dbUser = await findDbUserByDiscordId(discordUserId);
    if (!dbUser) {
      return createNotRegisteredResponse();
    }

    const region = resolveRegion(regionParam, dbUser.region);

    const deferredResponse = createDeferredResponse();

    const backgroundTask = (async () => {
      await generateAndSendDailyPlaysImage({
        userId: dbUser.id,
        discordUserId,
        region,
        day,
        applicationId,
        interactionToken,
      });
    })();

    waitUntil(backgroundTask);

    return deferredResponse;
  } catch (error) {
    console.error('Error handling daily command:', error);
    return createErrorResponse('An error occurred while fetching your daily plays. Please try again later.');
  }
}

export interface DailyAutocompleteOptions {
  discordUserId?: string;
  regionParam?: string;
  focusedValue: string;
}

/**
 * Autocomplete handler for the `date` option on /daily.
 * Returns up to 25 days the user has plays on, newest first, filtered by
 * whatever the user has typed so far.
 */
export async function handleDailyAutocomplete({
  discordUserId,
  regionParam,
  focusedValue,
}: DailyAutocompleteOptions): Promise<DiscordResponse> {
  if (!discordUserId) {
    return { type: 8, data: { choices: [] } };
  }

  try {
    const dbUser = await findDbUserByDiscordId(discordUserId);
    if (!dbUser) {
      return { type: 8, data: { choices: [] } };
    }

    const region = resolveRegion(regionParam, dbUser.region);
    const days = await listDailyPlaysAvailableDays(dbUser.id, region);
    const filtered = focusedValue
      ? days.filter(d => d.day.includes(focusedValue))
      : days;

    const choices = filtered.slice(0, 25).map(d => ({
      name: `${d.day} — ${d.count} ${d.count === 1 ? 'play' : 'plays'}`,
      value: d.day,
    }));

    return { type: 8, data: { choices } };
  } catch (error) {
    console.error('Error in daily autocomplete:', error);
    return { type: 8, data: { choices: [] } };
  }
}
