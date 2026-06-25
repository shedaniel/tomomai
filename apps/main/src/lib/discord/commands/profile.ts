import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import type { Region } from '@/lib/types';
import { generateAndSendProfileImage } from '../image-utils';
import {
  formatProfileSummaryContent,
  getProfileSummary,
  regionDisplayName,
  resolveRegion,
} from '../region';
import {
  createDeferredResponse,
  createErrorResponse,
  createNoDataResponse,
  createNotRegisteredResponse,
  DISCORD_COLORS,
  DiscordResponse,
  editDiscordMessage,
} from '../responses';
import { applyStalenessGate } from './staleness';

export interface ProfileCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  forceFetch?: boolean;
}

export interface ExecuteProfileOptions {
  dbUser: { id: string; name: string; username: string | null; region: Region | null };
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
}

export async function executeProfileCommand({
  dbUser,
  region,
  discordUserId,
  applicationId,
  interactionToken,
}: ExecuteProfileOptions): Promise<void> {
  const regionName = regionDisplayName(region);

  // Send initial loading message
  await editDiscordMessage(applicationId, interactionToken, {
    embeds: [{
      title: `🔄 Loading ${regionName} Profile`,
      description: `<@${discordUserId}> Generating your profile image...`,
      color: DISCORD_COLORS.BLURPLE,
      fields: [{
        name: '📊 Status',
        value: '⏳ Generating Profile Image',
        inline: false,
      }],
      footer: {
        text: 'tomomai ともマイ • maimai DX score tracker',
      },
      timestamp: new Date().toISOString(),
    }],
  });

  const summary = await getProfileSummary(dbUser.id, region);
  if (!summary) {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [createNoDataResponse(regionName).data!.embeds![0]],
    });
    return;
  }

  try {
    await new Promise(resolve => setTimeout(resolve, 500));
    await generateAndSendProfileImage({
      summary,
      discordUserId,
      regionName,
      applicationId,
      interactionToken,
      username: dbUser.username ?? dbUser.name,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating profile image');
    await editDiscordMessage(applicationId, interactionToken, {
      content: formatProfileSummaryContent(discordUserId, summary, regionName),
      embeds: [],
    });
  }
}

export async function handleProfileCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken,
  forceFetch,
}: ProfileCommandOptions): Promise<DiscordResponse> {
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

    const gate = await applyStalenessGate({
      command: 'profile',
      dbUser: { id: dbUser.id, name: dbUser.name, username: dbUser.username, region: dbUser.region },
      region,
      discordUserId,
      forceFetch,
      payload: '',
      applicationId,
      interactionToken,
    });
    if (gate) return gate;

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    waitUntil(executeProfileCommand({
      dbUser,
      region,
      discordUserId,
      applicationId,
      interactionToken,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error fetching user rating');
    return createErrorResponse('An error occurred while fetching your rating. Please try again later.');
  }
}
