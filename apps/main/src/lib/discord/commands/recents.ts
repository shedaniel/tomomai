import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import type { Region } from '@/lib/types';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { resolveRegion } from '../region';
import { findDiscordUser } from '../user';
import { generateAndSendCreditImage } from '../image-utils';
import { applyStalenessGate } from './staleness';
import { t } from '../i18n';

export interface RecentsCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  skip?: number;
  forceFetch?: boolean;
  locale?: string;
}

export interface ExecuteRecentsOptions {
  dbUserId: string;
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  skip?: number;
  locale?: string;
}

export async function executeRecentsCommand({
  dbUserId,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  skip = 0,
  locale,
}: ExecuteRecentsOptions): Promise<void> {
  await generateAndSendCreditImage({
    userId: dbUserId,
    discordUserId,
    region,
    applicationId,
    interactionToken,
    skip,
    locale,
  });
}

export async function handleRecentsCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken,
  skip = 0,
  forceFetch,
  locale,
}: RecentsCommandOptions): Promise<DiscordResponse> {
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

    // Staleness/force-fetch only apply on the initial invocation, not pagination.
    if (!skip) {
      const gate = await applyStalenessGate({
        command: 'recents',
        dbUser,
        region,
        discordUserId,
        forceFetch,
        payload: '',
        applicationId,
        interactionToken,
        locale,
      });
      if (gate) return gate;
    }

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    waitUntil(executeRecentsCommand({
      dbUserId: dbUser.id,
      region,
      discordUserId,
      applicationId,
      interactionToken,
      skip,
      locale,
    }));

    return deferredResponse;

  } catch (error) {
    getLogger().error({ err: error }, 'Error handling recents command');
    return createErrorResponse(t(locale, 'recents.errorGeneric'));
  }
}
