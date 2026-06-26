import { DISCORD_COLORS, editDiscordMessage } from './responses';
import { formatProfileSummaryContent, regionDisplayName, type ProfileSummary } from './region';
import type { Region } from '@/lib/types';
import { prepareCreditData } from '@/server/services/credit-data';
import { prepareDailyPlaysData } from '@/server/services/daily-plays-data';
import { getLogger } from '@/lib/request-logger';
import { requestDiscordRender } from './render-client';
import { buildExportImageMessage, buildLastCreditMessage, buildDailyPlaysMessage } from '@/lib/render-data';
import { t } from './i18n';

// Image rendering lives in apps/render. These helpers stay the Discord-domain
// layer: they compose the message (content/components), resolve the metadata the
// message needs, then delegate render + followup upload to the render service
// (image bytes go render → Discord directly). On a render failure they post a
// text fallback. apps/main no longer runs skia.

export interface ImageGenerationOptions {
  summary: ProfileSummary;
  discordUserId: string;
  regionName: string;
  applicationId: string;
  interactionToken: string;
  username: string;
  showGeneratingStatus?: boolean;
  locale?: string;
}

export async function generateAndSendProfileImage({
  summary,
  discordUserId,
  regionName,
  applicationId,
  interactionToken,
  username,
  showGeneratingStatus = false,
  locale,
}: ImageGenerationOptions): Promise<void> {
  if (showGeneratingStatus) {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: t(locale, 'fetch.generatingImage.title', { regionName }),
        description: t(locale, 'fetch.generatingImage.description', { userId: discordUserId }),
        color: DISCORD_COLORS.YELLOW,
        fields: [{
          name: t(locale, 'fetch.generatingImage.status'),
          value: t(locale, 'fetch.generatingImage.statusValue'),
          inline: false,
        }],
        footer: {
          text: t(locale, 'common.footer'),
        },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000';
  const profileUrl = `${baseUrl}/profile/${username}/`;

  const content = formatProfileSummaryContent(discordUserId, summary, regionName, locale);

  const components = [
    {
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 5, // Link style
          label: t(locale, 'profile.viewFullProfile'),
          url: profileUrl,
        },
      ],
    },
  ];

  try {
    const renderResult = await buildExportImageMessage({ snapshotId: summary.publicId, scale: 2 });
    if (!renderResult.ok) throw new Error(renderResult.error);
    await requestDiscordRender({
      message: renderResult.message,
      applicationId,
      interactionToken,
      payloadJson: { content, embeds: [], components },
      filename: 'maimai-profile.webp',
    });
  } catch (imageError) {
    // Fallback to text-only message if rendering fails.
    getLogger().error({ err: imageError }, 'Error generating profile image');
    await editDiscordMessage(applicationId, interactionToken, { content, embeds: [], components });
  }
}

export interface CreditImageOptions {
  userId: string;
  discordUserId: string;
  region: Region;
  applicationId: string;
  interactionToken: string;
  skip?: number;
  locale?: string;
}

export async function generateAndSendCreditImage({
  userId,
  discordUserId,
  region,
  applicationId,
  interactionToken,
  skip = 0,
  locale,
}: CreditImageOptions): Promise<void> {
  const regionName = regionDisplayName(region, locale);

  try {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: t(locale, 'recents.loading.title', { regionName }),
        description: t(locale, 'recents.loading.description', { userId: discordUserId }),
        color: DISCORD_COLORS.BLURPLE,
        fields: [{
          name: t(locale, 'recents.loading.status'),
          value: t(locale, 'recents.loading.statusValue'),
          inline: false,
        }],
        footer: {
          text: t(locale, 'common.footer'),
        },
        timestamp: new Date().toISOString(),
      }],
    });

    // Walk back `skip` credits to find the beforeDate of the one we want. We
    // fetch the credit metadata here (cheap) to build the message + nav buttons;
    // the render service re-fetches the same credit (deterministic for the same
    // beforeDate) to render the image.
    let beforeDate: Date | undefined = undefined;
    if (skip > 0) {
      let currentSkip = 0;
      let tempBeforeDate: Date | undefined = undefined;
      while (currentSkip < skip) {
        const tempResult = await prepareCreditData(userId, region, tempBeforeDate);
        if (tempResult.type === "error" || !tempResult.hasPreviousCredit) {
          throw new Error('No more plays found');
        }
        tempBeforeDate = new Date(tempResult.credit.playedAt.getTime() - 1);
        currentSkip++;
      }
      beforeDate = tempBeforeDate;
    }

    const prepareDataResult = await prepareCreditData(userId, region, beforeDate);
    if (prepareDataResult.type === "error") {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'recents.noPlays.title'),
          description: skip === 0
            ? t(locale, 'recents.noPlays.description', { regionName })
            : t(locale, 'recents.noPlays.noMore'),
          color: DISCORD_COLORS.YELLOW,
          footer: {
            text: t(locale, 'common.footer'),
          },
        }],
      });
      return;
    }

    const { credit, hasNextCredit, hasPreviousCredit } = prepareDataResult;

    const playedUnix = Math.floor(credit.playedAt.getTime() / 1000);
    const content = t(locale, 'recents.content', { userId: discordUserId, unix: playedUnix, regionName });

    const components = [
      {
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip - 1}`,
            label: t(locale, 'recents.newerPlay'),
            style: 2, // SECONDARY
            emoji: { name: '⬅️' },
            disabled: !hasNextCredit,
          },
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip + 1}`,
            label: t(locale, 'recents.olderPlay'),
            style: 2, // SECONDARY
            emoji: { name: '➡️' },
            disabled: !hasPreviousCredit,
          },
        ],
      },
    ];

    const renderResult = await buildLastCreditMessage({ userId, region, beforeDate, scale: 2 });
    if (!renderResult.ok) throw new Error(renderResult.error);
    await requestDiscordRender({
      message: renderResult.message,
      applicationId,
      interactionToken,
      payloadJson: { content, embeds: [], components },
      filename: `maimai-recent-${region}.webp`,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating credit image');
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: t(locale, 'recents.error.title'),
        description: t(locale, 'recents.error.description', { message: error instanceof Error ? error.message : 'Unknown error' }),
        color: DISCORD_COLORS.RED,
        footer: {
          text: t(locale, 'common.footer'),
        },
      }],
    });
  }
}

export interface DailyPlaysImageOptions {
  userId: string;
  discordUserId: string;
  region: Region;
  day?: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export async function generateAndSendDailyPlaysImage({
  userId,
  discordUserId,
  region,
  day,
  applicationId,
  interactionToken,
  locale,
}: DailyPlaysImageOptions): Promise<void> {
  const regionName = regionDisplayName(region, locale);

  try {
    // Resolve the day (and confirm there are plays) for the message; the render
    // service re-fetches to render. Passing the resolved day keeps both in sync.
    const result = await prepareDailyPlaysData(userId, region, day);
    if (result.type === 'error') {
      const content = day
        ? t(locale, 'daily.noPlaysDay', { userId: discordUserId, day, regionName })
        : t(locale, 'daily.noPlays', { userId: discordUserId, regionName });
      await editDiscordMessage(applicationId, interactionToken, {
        content,
      });
      return;
    }

    const { day: resolvedDay } = result;
    const content = t(locale, 'daily.content', { userId: discordUserId, day: resolvedDay, regionName });

    const renderResult = await buildDailyPlaysMessage({ userId, region, day: resolvedDay, scale: 2 });
    if (!renderResult.ok) throw new Error(renderResult.error);
    await requestDiscordRender({
      message: renderResult.message,
      applicationId,
      interactionToken,
      payloadJson: { content, embeds: [] },
      filename: `maimai-daily-${resolvedDay}.webp`,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating daily plays image');
    await editDiscordMessage(applicationId, interactionToken, {
      content: t(locale, 'daily.failed', { userId: discordUserId }),
    });
  }
}
