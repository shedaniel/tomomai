import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import type { Region } from '@/lib/games/ids';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { resolveRegion } from '../region';
import { findDiscordUser } from '../user';
import { generateAndSendDailyPlaysImage } from '../image-utils';
import { listDailyPlaysAvailableDays } from '@/server/services/games/maimai/render/daily-plays-data';
import { applyStalenessGate } from './staleness';
import { t } from '../i18n';

export interface DailyCommandOptions {
  discordUserId: string;
  regionParam?: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
  forceFetch?: boolean;
  locale?: string;
}

export interface ExecuteDailyOptions {
  dbUserId: string;
  region: Region;
  discordUserId: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export async function executeDailyCommand({
  dbUserId,
  region,
  discordUserId,
  day,
  applicationId,
  interactionToken,
  locale,
}: ExecuteDailyOptions): Promise<void> {
  await generateAndSendDailyPlaysImage({
    userId: dbUserId,
    discordUserId,
    region,
    day,
    applicationId,
    interactionToken,
    locale,
  });
}

export async function handleDailyCommand({
  discordUserId,
  regionParam,
  day,
  applicationId,
  interactionToken,
  forceFetch,
  locale,
}: DailyCommandOptions): Promise<DiscordResponse> {
  try {
    if (!discordUserId) {
      return createErrorResponse(t(locale, 'common.error.unableToIdentify'));
    }

    const dbUser = await findDiscordUser(discordUserId);
    if (!dbUser) {
      return createNotRegisteredResponse(locale);
    }

    const region = resolveRegion(regionParam, dbUser.region);
    if (!region) return createErrorResponse(t(locale, 'common.error.noRegion'));

    const gate = await applyStalenessGate({
      command: 'daily',
      dbUser,
      region,
      discordUserId,
      forceFetch,
      payload: day ?? '',
      day,
      applicationId,
      interactionToken,
      locale,
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
      locale,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error handling daily command');
    return createErrorResponse(t(locale, 'daily.errorGeneric'));
  }
}

export interface DailyAutocompleteOptions {
  discordUserId?: string;
  regionParam?: string;
  focusedValue: string;
  locale?: string;
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
  locale,
}: DailyAutocompleteOptions): Promise<DiscordResponse> {
  if (!discordUserId) {
    return { type: 8, data: { choices: [] } };
  }

  try {
    const dbUser = await findDiscordUser(discordUserId);
    if (!dbUser) {
      return { type: 8, data: { choices: [] } };
    }

    const region = resolveRegion(regionParam, dbUser.region);
    if (!region) return { type: 8, data: { choices: [] } };
    const days = await listDailyPlaysAvailableDays(dbUser.id, region);
    const filtered = focusedValue
      ? days.filter(d => d.day.includes(focusedValue))
      : days;

    const choices = filtered.slice(0, 25).map(d => ({
      name: `${d.day} — ${d.count} ${t(locale, d.count === 1 ? 'daily.play' : 'daily.plays')}`,
      value: d.day,
    }));

    return { type: 8, data: { choices } };
  } catch (error) {
    getLogger().error({ err: error }, 'Error in daily autocomplete');
    return { type: 8, data: { choices: [] } };
  }
}
