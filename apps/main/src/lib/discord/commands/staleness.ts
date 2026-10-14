import { userSnapshots } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import type { Region } from '@/lib/games/ids';
import {
  createDeferredResponse,
  createErrorResponse,
  DiscordResponse,
  DISCORD_COLORS,
  editDiscordMessage,
} from '../responses';
import { resolveRegion } from '../region';
import { regionDisplayName, t } from '../i18n';
import { runFetchSession } from './fetch';
import { executeProfileCommand } from './profile';
import { executeRecentsCommand } from './recents';
import { executeRecommendCommand } from './recommend';
import { executeDailyCommand } from './daily';
import {
  getStalePromptResponse,
  isStale,
  type StaleCommand,
} from '../staleness';
import { latestSnapshot } from '@/server/queries/latest-snapshot';
import { DISCORD_GAME } from '../game';
import { findDiscordUser, type DiscordUser } from '../user';

async function runCommand(
  command: StaleCommand,
  dbUser: DiscordUser,
  region: Region,
  discordUserId: string,
  applicationId: string,
  interactionToken: string,
  locale: string | undefined,
  day?: string,
): Promise<void> {
  switch (command) {
    case 'profile':
      await executeProfileCommand({ dbUser, region, discordUserId, applicationId, interactionToken, locale });
      break;
    case 'recents':
      await executeRecentsCommand({ dbUserId: dbUser.id, region, discordUserId, applicationId, interactionToken, locale });
      break;
    case 'recommend':
      await executeRecommendCommand({ dbUserId: dbUser.id, region, discordUserId, applicationId, interactionToken, locale });
      break;
    case 'daily':
      await executeDailyCommand({ dbUserId: dbUser.id, region, discordUserId, day, applicationId, interactionToken, locale });
      break;
  }
}

export interface ApplyStalenessGateOptions {
  command: StaleCommand;
  dbUser: DiscordUser;
  region: Region;
  discordUserId: string;
  forceFetch?: boolean;
  payload: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

/**
 * Decide whether a data command should short-circuit before running.
 * Returns a `DiscordResponse` (force-refetch or staleness prompt) when it
 * should, or `null` when the command should proceed normally.
 */
export async function applyStalenessGate({
  command,
  dbUser,
  region,
  discordUserId,
  forceFetch,
  payload,
  day,
  applicationId,
  interactionToken,
  locale,
}: ApplyStalenessGateOptions): Promise<DiscordResponse | null> {
  if (forceFetch) {
    return runRefetchThenCommand({
      command,
      dbUser,
      region,
      discordUserId,
      applicationId,
      interactionToken,
      locale,
      day,
    });
  }

  try {
    const lastFetchedAt = (await latestSnapshot(DISCORD_GAME, dbUser.id, region, { fetchedAt: userSnapshots.fetchedAt }))?.fetchedAt;
    if (lastFetchedAt && isStale(lastFetchedAt)) {
      return getStalePromptResponse({
        command,
        discordUserId,
        region,
        regionName: regionDisplayName(region, locale),
        lastFetchedAt,
        payload,
        locale,
      });
    }
  } catch (error) {
    getLogger().error({ err: error }, 'Staleness check failed, proceeding with command');
  }

  return null;
}

export interface RunRefetchThenCommandOptions {
  command: StaleCommand;
  dbUser: DiscordUser;
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
  day?: string;
}

/**
 * Refetch from maimai DX NET, then run the given command. Shared by the
 * `forceFetch` slash-option path and the staleness "Refetch and continue"
 * button path. Returns a deferred response immediately.
 */
export function runRefetchThenCommand({
  command,
  dbUser,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  locale,
  day,
}: RunRefetchThenCommandOptions): DiscordResponse {
  const deferredResponse = createDeferredResponse();

  const backgroundTask = (async () => {
    const regionName = regionDisplayName(region, locale);
    try {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'staleness.refetching.title', { regionName }),
          description: t(locale, 'staleness.refetching.description', { userId: discordUserId }),
          color: DISCORD_COLORS.YELLOW,
          footer: { text: t(locale, 'common.footer') },
          timestamp: new Date().toISOString(),
        }],
        components: [],
      });

      const ok = await runFetchSession({
        userId: dbUser.id,
        username: dbUser.username ?? dbUser.name,
        region,
        regionName,
        discordUserId,
        applicationId,
        interactionToken,
        locale,
        onCompleted: async () => { /* command runs next */ },
      });

      if (!ok) return; // runFetchSession already posted the error/timeout embed

      await runCommand(command, dbUser, region, discordUserId, applicationId, interactionToken, locale, day);
    } catch (error) {
      getLogger().error({ err: error }, 'Error in refetch-then-command');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'staleness.refetchError.title'),
          description: t(locale, 'staleness.refetchError.description', { userId: discordUserId }),
          color: DISCORD_COLORS.RED,
          footer: { text: t(locale, 'common.footer') },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  })();

  waitUntil(backgroundTask);

  return deferredResponse;
}

export interface HandleStalenessChoiceOptions {
  command: StaleCommand;
  discordUserId: string;
  region: Region;
  refetch: boolean;
  payload: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

/**
 * Handle a click on the staleness prompt buttons. `payload` carries the
 * `/daily` day (empty string = default day).
 */
export async function handleStalenessChoice({
  command,
  discordUserId,
  region,
  refetch,
  payload,
  applicationId,
  interactionToken,
  locale,
}: HandleStalenessChoiceOptions): Promise<DiscordResponse> {
  if (!discordUserId) {
    return createErrorResponse(t(locale, 'common.error.unableToIdentifyShort'));
  }

  const dbUser = await findDiscordUser(discordUserId);
  if (!dbUser) {
    return createErrorResponse(t(locale, 'common.error.generic'));
  }

  const resolvedRegion = resolveRegion(region, dbUser.region);
  if (!resolvedRegion) return createErrorResponse(t(locale, 'common.error.noRegion'));
  const day = command === 'daily' && payload ? payload : undefined;

  if (refetch) {
    return runRefetchThenCommand({
      command,
      dbUser,
      region: resolvedRegion,
      discordUserId,
      applicationId,
      interactionToken,
      locale,
      day,
    });
  }

  const deferredResponse = createDeferredResponse();

  const backgroundTask = (async () => {
    try {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'common.loading.title'),
          description: t(locale, 'common.loading.description', { userId: discordUserId }),
          color: DISCORD_COLORS.BLURPLE,
          footer: { text: t(locale, 'common.footer') },
          timestamp: new Date().toISOString(),
        }],
        components: [],
      });
      await runCommand(command, dbUser, resolvedRegion, discordUserId, applicationId, interactionToken, locale, day);
    } catch (error) {
      getLogger().error({ err: error }, 'Error in staleness continue path');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'common.error.title'),
          description: t(locale, 'common.error.generic'),
          color: DISCORD_COLORS.RED,
          footer: { text: t(locale, 'common.footer') },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  })();

  waitUntil(backgroundTask);

  return deferredResponse;
}
