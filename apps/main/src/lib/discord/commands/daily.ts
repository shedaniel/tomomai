import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import type { Region } from '@/lib/types';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { resolveRegion } from '../region';
import { generateAndSendDailyPlaysImage } from '../image-utils';
import { listDailyPlaysAvailableDays } from '@/server/services/daily-plays-data';
import { applyStalenessGate } from './staleness';

async function findDbUserByDiscordId(discordUserId: string) {
  const [dbUser] = await db
    .select({ id: user.id, name: user.name, username: user.username, region: user.region })
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
  forceFetch?: boolean;
}

export interface ExecuteDailyOptions {
  dbUserId: string;
  region: Region;
  discordUserId: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
}

export async function executeDailyCommand({
  dbUserId,
  region,
  discordUserId,
  day,
  applicationId,
  interactionToken,
}: ExecuteDailyOptions): Promise<void> {
  await generateAndSendDailyPlaysImage({
    userId: dbUserId,
    discordUserId,
    region,
    day,
    applicationId,
    interactionToken,
  });
}

export async function handleDailyCommand({
  discordUserId,
  regionParam,
  day,
  applicationId,
  interactionToken,
  forceFetch,
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

    const gate = await applyStalenessGate({
      command: 'daily',
      dbUser: { id: dbUser.id, name: dbUser.name, username: dbUser.username, region: dbUser.region },
      region,
      discordUserId,
      forceFetch,
      payload: day ?? '',
      day,
      applicationId,
      interactionToken,
    });
    if (gate) return gate;

    const deferredResponse = createDeferredResponse();

    waitUntil(executeDailyCommand({
      dbUserId: dbUser.id,
      region,
      discordUserId,
      day,
      applicationId,
      interactionToken,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error handling daily command');
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
    getLogger().error({ err: error }, 'Error in daily autocomplete');
    return { type: 8, data: { choices: [] } };
  }
}
