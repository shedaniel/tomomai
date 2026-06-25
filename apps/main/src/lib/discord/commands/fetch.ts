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
import { Region } from '@/lib/types';

export interface FetchCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
}

function createAlbumPreferenceMessage(discordUserId: string, region: Region) {
  return {
    embeds: [{
      title: '⚙️ Album Privacy Settings Required',
      description: `<@${discordUserId}> Before fetching data, you need to set your album privacy preference.`,
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: 'What is this?',
        value: 'Albums are images stored with your profile data. You can choose whether to save them or not based on your privacy preferences.',
        inline: false,
      }, {
        name: 'Privacy Assurance',
        value: '✓ Albums are stored in your private profile\n✓ Not shared publicly unless you make them public\n✓ Only you can see them\n✓ Automatically deleted after 30 days\n✓ You can change this setting anytime',
        inline: false,
      }],
      footer: {
        text: 'tomomai ともマイ • maimai DX score tracker',
      },
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          custom_id: `album_preference_${discordUserId}_${region}_0`,
          label: 'Don\'t Save Albums',
          style: 2, // SECONDARY
        },
        {
          type: 2, // BUTTON
          custom_id: `album_preference_${discordUserId}_${region}_1`,
          label: 'Save Albums',
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
  interactionToken
}: FetchCommandOptions): Promise<DiscordResponse> {
  try {
    if (!discordUserId) {
      return createErrorResponse('Unable to identify Discord user. Please try again.');
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
      return createNotRegisteredResponse();
    }

    const region = resolveRegion(regionParam, dbUser.region);
    const regionName = regionDisplayName(region);

    // Check current time, if it is within 4AM - 7AM in JST, throw an error
    const now = new Date();
    const jstHour = (now.getUTCHours() + 9) % 24;
    if (jstHour >= 4 && jstHour < 7) {
      return createErrorResponse("Cannot fetch data during maintenance window (4AM - 7AM JST)");
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
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error starting fetch');
    return createErrorResponse('An error occurred while starting the fetch. Please try again later.');
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
}: {
  userId: string;
  username: string;
  region: Region;
  regionName: string;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  onCompleted?: () => Promise<void>;
}): Promise<boolean> {
  try {
    // Start the fetch
    const startResult = await startFetchServer(userId, region, undefined, undefined, { skipAfter: true });

    // Send initial message
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: `🔄 Fetching ${regionName} Data`,
        description: `<@${discordUserId}> Starting data fetch from maimai DX NET...`,
        color: DISCORD_COLORS.YELLOW,
        fields: [{
          name: '📊 Status',
          value: 'Initializing...',
          inline: false,
        }],
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
        },
        timestamp: new Date().toISOString(),
      }],
    });

    const completed = await pollForUpdates(userId, region, regionName, discordUserId, startResult.sessionId, applicationId, interactionToken);
    if (!completed) return false;

    // Ensure background work (detail fetches for recents/albums) completes
    await startResult.backgroundWork;

    if (onCompleted) {
      await onCompleted();
    } else {
      await handleFetchCompleted(userId, username, region, regionName, discordUserId, applicationId, interactionToken);
    }
    return true;
  } catch (error) {
    getLogger().error({ err: error }, 'Error in fetch process');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (isAlbumSettingsError(errorMessage)) {
      await editDiscordMessage(applicationId, interactionToken, createAlbumPreferenceMessage(discordUserId, region));
    } else {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '❌ Fetch Error',
          description: `<@${discordUserId}> An error occurred while fetching your data: ${errorMessage}`,
          color: DISCORD_COLORS.RED,
          footer: {
            text: 'tomomai ともマイ • maimai DX score tracker',
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
  interactionToken: string
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
            await editDiscordMessage(applicationId, interactionToken, createAlbumPreferenceMessage(discordUserId, region));
          } else {
            await editDiscordMessage(applicationId, interactionToken, {
              embeds: [{
                title: '❌ Fetch Failed',
                description: `<@${discordUserId}> Failed to fetch ${regionName} data: ${failureReason}`,
                color: DISCORD_COLORS.RED,
                footer: {
                  text: 'tomomai ともマイ • maimai DX score tracker',
                },
                timestamp: new Date().toISOString(),
              }],
            });
          }
          return false;
        } else {
          // Still pending, update with progress
          await updateFetchProgress(status.statusStates || '', regionName, discordUserId, applicationId, interactionToken);
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
      title: '⏰ Fetch Timeout',
      description: `<@${discordUserId}> The fetch is taking longer than expected. Please check your data on the website.`,
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: '🌐 Check Status',
        value: `[Visit tomomai ともマイ](${resolveBaseUrl()}/) to see your latest data!`,
        inline: false,
      }],
      footer: {
        text: 'tomomai ともマイ • maimai DX score tracker',
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
  interactionToken: string
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
    });
  } else {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: '✅ Fetch Complete',
        description: `<@${discordUserId}> Data fetch completed successfully!`,
        color: DISCORD_COLORS.GREEN,
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
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
  interactionToken: string
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
      title: `🔄 Fetching ${regionName} Data`,
      description: `<@${discordUserId}> Fetching data from maimai DX NET...`,
      color: DISCORD_COLORS.YELLOW,
      fields: [{
        name: '📊 Status',
        value: statusText,
        inline: false,
      }],
      footer: {
        text: 'tomomai ともマイ • maimai DX score tracker',
      },
      timestamp: new Date().toISOString(),
    }],
  });
}
