import { DISCORD_COLORS, editDiscordMessage } from './responses';
import { formatProfileSummaryContent, regionDisplayName, type ProfileSummary } from './region';
import type { Region } from '@/lib/types';
import { prepareCreditData } from '@/server/services/credit-data';
import { prepareDailyPlaysData } from '@/server/services/daily-plays-data';
import { getLogger } from '@/lib/request-logger';
import { requestDiscordRender } from './render-client';

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
}

export async function generateAndSendProfileImage({
  summary,
  discordUserId,
  regionName,
  applicationId,
  interactionToken,
  username,
  showGeneratingStatus = false,
}: ImageGenerationOptions): Promise<void> {
  if (showGeneratingStatus) {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: `🔄 Fetching ${regionName} Data`,
        description: `<@${discordUserId}> Data fetch completed, generating profile image...`,
        color: DISCORD_COLORS.YELLOW,
        fields: [{ name: '📊 Status', value: '⏳ Generating Profile Image', inline: false }],
        footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
        timestamp: new Date().toISOString(),
      }],
    });
  }

  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000';
  const profileUrl = `${baseUrl}/profile/${username}/`;

  const content = formatProfileSummaryContent(discordUserId, summary, regionName);
  const components = [
    {
      type: 1, // Action Row
      components: [
        { type: 2, style: 5, label: '🔗 View Full Profile', url: profileUrl }, // Link button
      ],
    },
  ];

  try {
    await requestDiscordRender({
      render: { route: 'export-image', snapshotId: summary.publicId },
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
}

export async function generateAndSendCreditImage({
  userId,
  discordUserId,
  region,
  applicationId,
  interactionToken,
  skip = 0,
}: CreditImageOptions): Promise<void> {
  const regionName = regionDisplayName(region);

  try {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: `🔄 Loading ${regionName} Recent Plays`,
        description: `<@${discordUserId}> Generating your recent play image...`,
        color: DISCORD_COLORS.BLURPLE,
        fields: [{ name: '📊 Status', value: '⏳ Generating Image', inline: false }],
        footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
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
          title: '📊 No Recent Plays Found',
          description: skip === 0
            ? `You don't have any recent ${regionName} region plays yet!`
            : `No more plays found.`,
          color: DISCORD_COLORS.YELLOW,
          footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
        }],
      });
      return;
    }

    const { credit, hasNextCredit, hasPreviousCredit } = prepareDataResult;

    const playedUnix = Math.floor(credit.playedAt.getTime() / 1000);
    const content = `<@${discordUserId}> Here are your recent plays at <t:${playedUnix}:f> (${regionName})`;

    const components = [
      {
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip - 1}`,
            label: 'Newer Play',
            style: 2, // SECONDARY
            emoji: { name: '⬅️' },
            disabled: !hasNextCredit,
          },
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip + 1}`,
            label: 'Older Play',
            style: 2, // SECONDARY
            emoji: { name: '➡️' },
            disabled: !hasPreviousCredit,
          },
        ],
      },
    ];

    await requestDiscordRender({
      render: { route: 'last-credit', userId, region, beforeDate: beforeDate?.toISOString() },
      applicationId,
      interactionToken,
      payloadJson: { content, embeds: [], components },
      filename: `maimai-recent-${region}.webp`,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating credit image');
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: '❌ Error',
        description: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        color: DISCORD_COLORS.RED,
        footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
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
}

export async function generateAndSendDailyPlaysImage({
  userId,
  discordUserId,
  region,
  day,
  applicationId,
  interactionToken,
}: DailyPlaysImageOptions): Promise<void> {
  const regionName = regionDisplayName(region);

  try {
    // Resolve the day (and confirm there are plays) for the message; the render
    // service re-fetches to render. Passing the resolved day keeps both in sync.
    const result = await prepareDailyPlaysData(userId, region, day);
    if (result.type === 'error') {
      await editDiscordMessage(applicationId, interactionToken, {
        content: `<@${discordUserId}> No plays found${day ? ` for ${day}` : ''} (${regionName}).`,
      });
      return;
    }

    const { day: resolvedDay } = result;
    const content = `<@${discordUserId}> Daily plays for **${resolvedDay}** (${regionName})`;

    await requestDiscordRender({
      render: { route: 'daily-plays', userId, region, day: resolvedDay },
      applicationId,
      interactionToken,
      payloadJson: { content, embeds: [] },
      filename: `maimai-daily-${resolvedDay}.webp`,
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating daily plays image');
    await editDiscordMessage(applicationId, interactionToken, {
      content: `<@${discordUserId}> ❌ Failed to generate daily plays image.`,
    });
  }
}
