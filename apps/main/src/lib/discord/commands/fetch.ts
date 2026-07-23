import { db } from '@/lib/db';
import { getAllStates, parseStatusStates } from '@/lib/fetch-states';
import { getFetchStatusServer, startFetchServer } from '@/lib/maimai-server-actions';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import { generateAndSendProfileImage } from '../image-utils';
import { getProfileSummary, regionDisplayName, resolveRegion } from '../region';
import { isAlbumSettingsError } from '@/lib/token-errors';
import { resolveBaseUrl } from '@/lib/base-url';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DISCORD_COLORS,
  DiscordResponse,
  editDiscordMessage,
  getStateFriendlyName
} from '../responses';
import { t } from '../i18n';
import { Region } from '@/lib/types';

export interface FetchCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

function createAlbumPreferenceMessage(discordUserId: string, region: Region, locale?: string) {
  return {
    embeds: [{
      title: t(locale, 'fetch.albumPreference.title'),
      description: t(locale, 'fetch.albumPreference.description', { userId: discordUserId }),
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: t(locale, 'fetch.albumPreference.whatName'),
        value: t(locale, 'fetch.albumPreference.whatValue'),
        inline: false,
      }, {
        name: t(locale, 'fetch.albumPreference.privacyName'),
        value: t(locale, 'fetch.albumPreference.privacyValue'),
        inline: false,
      }],
      footer: {
        text: t(locale, 'common.footer'),
      },
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          custom_id: `album_preference_${discordUserId}_${region}_0`,
          label: t(locale, 'fetch.albumPreference.dontSave'),
          style: 2, // SECONDARY
        },
        {
          type: 2, // BUTTON
          custom_id: `album_preference_${discordUserId}_${region}_1`,
          label: t(locale, 'fetch.albumPreference.save'),
          style: 1, // PRIMARY
        },
      ],
    }],
  };
}

export async function handleFetchCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken,
  locale,
}: FetchCommandOptions): Promise<DiscordResponse> {
  try {
    if (!discordUserId) {
      return createErrorResponse(t(locale, 'common.error.unableToIdentify'), locale);
    }

    // Find user by Discord ID via account table
    const [dbUser] = await db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        region: user.region,
      })
      .from(user)
      .innerJoin(account, eq(account.userId, user.id))
      .where(and(
        eq(account.accountId, discordUserId),
        eq(account.providerId, 'discord')
      ))
      .limit(1);

    if (!dbUser) {
      return createNotRegisteredResponse(locale);
    }

    const region = resolveRegion(regionParam, dbUser.region);
    const regionName = regionDisplayName(region, locale);

    // Check current time, if it is within 4AM - 7AM in JST, throw an error
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    if (jstHour >= 4 && jstHour < 7) {
      return createErrorResponse(t(locale, 'fetch.maintenanceWindow'), locale);
    }

    // Defer the response since fetch can take a while
    const deferredResponse = createDeferredResponse();

    waitUntil(runFetchSession({
      userId: dbUser.id,
      username: dbUser.username ?? dbUser.name,
      region,
      regionName,
      discordUserId,
      applicationId,
      interactionToken,
      locale,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error starting fetch');
    return createErrorResponse(t(locale, 'fetch.startError'), locale);
  }
}

export async function runFetchSession({
  userId,
  username,
  region,
  regionName,
  discordUserId,
  applicationId,
  interactionToken,
  onCompleted,
  locale,
}: {
  userId: string;
  username: string;
  region: Region;
  regionName: string;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  onCompleted?: () => Promise<void>;
  locale?: string;
}): Promise<boolean> {
  try {
    // Start the fetch
    const startResult = await startFetchServer(userId, region, undefined, { skipAfter: true });

    // Send initial message
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: t(locale, 'fetch.initializing.title', { regionName }),
        description: t(locale, 'fetch.initializing.description', { userId: discordUserId }),
        color: DISCORD_COLORS.YELLOW,
        fields: [{
          name: t(locale, 'fetch.initializing.status'),
          value: t(locale, 'fetch.initializing.statusValue'),
          inline: false,
        }],
        footer: {
          text: t(locale, 'common.footer'),
        },
        timestamp: new Date().toISOString(),
      }],
    });

    const completed = await pollForUpdates(userId, region, regionName, discordUserId, startResult.sessionId, applicationId, interactionToken, locale);
    if (!completed) return false;

    // Ensure background work (detail fetches for recents/albums) completes
    await startResult.backgroundWork;

    if (onCompleted) {
      await onCompleted();
    } else {
      await handleFetchCompleted(userId, username, region, regionName, discordUserId, applicationId, interactionToken, locale);
    }
    return true;
  } catch (error) {
    getLogger().error({ err: error }, 'Error in fetch process');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (isAlbumSettingsError(errorMessage)) {
      await editDiscordMessage(applicationId, interactionToken, createAlbumPreferenceMessage(discordUserId, region, locale));
    } else {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'fetch.error.title'),
          description: t(locale, 'fetch.error.description', { userId: discordUserId, message: errorMessage }),
          color: DISCORD_COLORS.RED,
          footer: {
            text: t(locale, 'common.footer'),
          },
          timestamp: new Date().toISOString(),
        }],
      });
    }
    return false;
  }
}

async function pollForUpdates(
  userId: string,
  region: Region,
  regionName: string,
  discordUserId: string,
  sessionId: string,
  applicationId: string,
  interactionToken: string,
  locale?: string,
): Promise<boolean> {
  const maxAttempts = 600; // 5 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await getFetchStatusServer(userId, region);

      if (status && status.id === sessionId) {
        if (status.status === "completed") {
          return true;
        } else if (status.status === "failed") {
          const failureReason = status.errorMessage || 'Unknown error';

          // Check if this is an album settings error
          if (isAlbumSettingsError(failureReason)) {
            await editDiscordMessage(applicationId, interactionToken, createAlbumPreferenceMessage(discordUserId, region, locale));
          } else {
            await editDiscordMessage(applicationId, interactionToken, {
              embeds: [{
                title: t(locale, 'fetch.failed.title'),
                description: t(locale, 'fetch.failed.description', { userId: discordUserId, regionName, reason: failureReason }),
                color: DISCORD_COLORS.RED,
                footer: {
                  text: t(locale, 'common.footer'),
                },
                timestamp: new Date().toISOString(),
              }],
            });
          }
          return false;
        } else {
          // Still pending, update with progress
          await updateFetchProgress(status.statusStates || '', regionName, discordUserId, applicationId, interactionToken, locale);
        }
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500)); // Poll every 0.5 seconds
    } catch (error) {
      getLogger().error({ err: error }, 'Error polling fetch status');
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Timeout
  await editDiscordMessage(applicationId, interactionToken, {
    embeds: [{
      title: t(locale, 'fetch.timeout.title'),
      description: t(locale, 'fetch.timeout.description', { userId: discordUserId }),
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: t(locale, 'fetch.timeout.statusName'),
        value: t(locale, 'fetch.timeout.statusValue', { baseUrl: resolveBaseUrl() }),
        inline: false,
      }],
      footer: {
        text: t(locale, 'common.footer'),
      },
      timestamp: new Date().toISOString(),
    }],
  });
  return false;
}

async function handleFetchCompleted(
  userId: string,
  username: string,
  region: Region,
  regionName: string,
  discordUserId: string,
  applicationId: string,
  interactionToken: string,
  locale?: string,
): Promise<void> {
  // Get the updated snapshot data with new/old chart rating breakdown
  const summary = await getProfileSummary(userId, region);

  if (summary) {
    // Generate and send the profile image using the shared utility
    await new Promise(resolve => setTimeout(resolve, 500));
    await generateAndSendProfileImage({
      summary,
      discordUserId,
      regionName,
      applicationId,
      interactionToken,
      username,
      showGeneratingStatus: true,
      locale,
    });
  } else {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: t(locale, 'fetch.complete.title'),
        description: t(locale, 'fetch.complete.description', { userId: discordUserId }),
        color: DISCORD_COLORS.GREEN,
        footer: {
          text: t(locale, 'common.footer'),
        },
        timestamp: new Date().toISOString(),
      }],
    });
  }
}

async function updateFetchProgress(
  statusStates: string,
  regionName: string,
  discordUserId: string,
  applicationId: string,
  interactionToken: string,
  locale?: string,
): Promise<void> {
  const allStates = getAllStates();
  const completedStates = parseStatusStates(statusStates);

  // Format all states with appropriate emojis
  const formattedStates = allStates.map(state => {
    const friendlyName = getStateFriendlyName(state);
    let emoji;

    if (completedStates.includes(state)) {
      emoji = '✅';
    } else {
      emoji = '⏳';
    }

    return `${emoji} ${friendlyName}`;
  });

  const statusText = formattedStates.join('\n');

  await editDiscordMessage(applicationId, interactionToken, {
    embeds: [{
      title: t(locale, 'fetch.progress.title', { regionName }),
      description: t(locale, 'fetch.progress.description', { userId: discordUserId }),
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: t(locale, 'fetch.progress.status'),
        value: statusText,
        inline: false,
      }],
      footer: {
        text: t(locale, 'common.footer'),
      },
      timestamp: new Date().toISOString(),
    }],
  });
}
