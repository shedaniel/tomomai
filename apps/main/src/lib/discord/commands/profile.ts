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
import { t } from '../i18n';

export interface ProfileCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  forceFetch?: boolean;
  locale?: string;
}

export interface ExecuteProfileOptions {
  dbUser: { id: string; name: string; username: string | null; region: Region | null };
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export async function executeProfileCommand({
  dbUser,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  locale,
}: ExecuteProfileOptions): Promise<void> {
  const regionName = regionDisplayName(region, locale);

  // Send initial loading message
  await editDiscordMessage(applicationId, interactionToken, {
    embeds: [{
      title: t(locale, 'profile.loading.title', { regionName }),
      description: t(locale, 'profile.loading.description', { userId: discordUserId }),
      color: DISCORD_COLORS.BLURPLE,
      fields: [{
        name: t(locale, 'profile.loading.status'),
        value: t(locale, 'profile.loading.statusValue'),
        inline: false,
      }],
      footer: {
        text: t(locale, 'common.footer'),
      },
      timestamp: new Date().toISOString(),
    }],
  });

  const summary = await getProfileSummary(dbUser.id, region);
  if (!summary) {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [createNoDataResponse(regionName, locale).data!.embeds![0]],
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
      locale,
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
  locale,
}: ProfileCommandOptions): Promise<DiscordResponse> {
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

    const gate = await applyStalenessGate({
      command: 'profile',
      dbUser: { id: dbUser.id, name: dbUser.name, username: dbUser.username, region: dbUser.region },
      region,
      discordUserId,
      forceFetch,
      payload: '',
      applicationId,
      interactionToken,
      locale,
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
      locale,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error fetching user rating');
    return createErrorResponse(t(locale, 'profile.error'), locale);
  }
}
