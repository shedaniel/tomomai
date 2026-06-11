import {
  DISCORD_COLORS,
  editDiscordMessage,
  editDiscordMessageWithImageAndContent,
} from './responses';
import { formatProfileSummaryContent, regionDisplayName, type ProfileSummary } from './region';
import type { Region } from '@/lib/types';
import { prepareCreditData } from '@/server/services/credit-data';
import { prepareDailyPlaysData } from '@/server/services/daily-plays-data';
import { ImageCache, renderDailyPlaysImage, renderLastCreditImage } from '@/lib/render-image';
import { fetchImageForServer, loadCachedImage } from '@/lib/render-image-server';
import { getLogger } from '@/lib/request-logger';
import { commonSnapshotResources } from '@/lib/render-image-route';
import { Image, loadImage } from 'skia-canvas';
import { getRatingImageUrl } from '@/lib/rating-calculator';
import { getLogoUrl, getTypeBadgeUrl } from '@/lib/utils';
import { DIFFICULTY_ENUM } from '@/lib/db/types';

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
  // Show image generation status if requested
  if (showGeneratingStatus) {
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: `🔄 Fetching ${regionName} Data`,
        description: `<@${discordUserId}> Data fetch completed, generating profile image...`,
        color: DISCORD_COLORS.YELLOW,
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
  }

  // Generate profile URL
  const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000';
  const profileUrl = `${baseUrl}/profile/${username}/`;

  const content = formatProfileSummaryContent(discordUserId, summary, regionName);

  const components = [
    {
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          style: 5, // Link style
          label: '🔗 View Full Profile',
          url: profileUrl,
        },
      ],
    },
  ];

  try {
    // Generate the image
    const imageResponse = await fetch(`${baseUrl}/api/export-image?snapshotId=${summary.publicId}`, {
      method: 'GET',
    });

    if (imageResponse.ok) {
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      await editDiscordMessageWithImageAndContent(applicationId, interactionToken, content, imageBuffer, components);
    } else {
      // Fallback to text-only message if image generation fails
      getLogger().error({ status: imageResponse.status }, `Failed to generate image: ${await imageResponse.text()}`);
      await editDiscordMessage(applicationId, interactionToken, { content, embeds: [], components });
    }
  } catch (imageError) {
    // Fallback to text-only message if image generation fails
    getLogger().error({ err: imageError }, 'Error generating image');
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
    // Show loading message
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: `🔄 Loading ${regionName} Recent Plays`,
        description: `<@${discordUserId}> Generating your recent play image...`,
        color: DISCORD_COLORS.BLURPLE,
        fields: [{
          name: '📊 Status',
          value: '⏳ Generating Image',
          inline: false,
        }],
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
        },
        timestamp: new Date().toISOString(),
      }],
    });

    // Calculate beforeDate for pagination
    // We need to fetch data to get the beforeDate for the skip+1 credit
    let beforeDate: Date | undefined = undefined;

    // If skip > 0, we need to find the playedAt of the credit we want to skip to
    if (skip > 0) {
      // Fetch credits to find the one we want
      let currentSkip = 0;
      let tempBeforeDate: Date | undefined = undefined;

      while (currentSkip < skip) {
        const tempResult = await prepareCreditData(userId, region, tempBeforeDate);
        if (tempResult.type === "error" || !tempResult.hasPreviousCredit) {
          // No more credits available
          throw new Error('No more plays found');
        }
        // Set beforeDate to just before this credit to get the next older one
        tempBeforeDate = new Date(tempResult.credit.playedAt.getTime() - 1);
        currentSkip++;
      }

      beforeDate = tempBeforeDate;
    }

    // Prepare credit data
    const prepareDataResult = await prepareCreditData(userId, region, beforeDate);

    if (prepareDataResult.type === "error") {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '📊 No Recent Plays Found',
          description: skip === 0
            ? `You don't have any recent ${regionName} region plays yet!`
            : `No more plays found.`,
          color: DISCORD_COLORS.YELLOW,
          footer: {
            text: 'tomomai ともマイ • maimai DX score tracker',
          },
        }],
      });
      return;
    }

    const { credit, snapshot, hasNextCredit, hasPreviousCredit } = prepareDataResult;

    // Cache all images needed for rendering
    const imagesToCache = [
      getTypeBadgeUrl("dx"),
      getTypeBadgeUrl("std"),
      getRatingImageUrl(snapshot.rating, snapshot.gameVersion),
      snapshot.iconUrl,
      snapshot.classRankUrl,
      snapshot.courseRankUrl,
      `/res/trophy/normal.png`,
      `/res/trophy/bronze.png`,
      `/res/trophy/silver.png`,
      `/res/trophy/gold.png`,
      `/res/trophy/rainbow.png`,
      `/res/character/${snapshot.gameVersion}.png`,
      getLogoUrl(snapshot.gameVersion, region),
      `/res/bg/${snapshot.gameVersion}.png`,
      `/res/bg/${snapshot.gameVersion}_long.png`,
      `/res/badge/${snapshot.gameVersion}/none.png`,
      `/res/badge/${snapshot.gameVersion}/sync.png`,
      `/res/badge/${snapshot.gameVersion}/fc.png`,
      `/res/badge/${snapshot.gameVersion}/fc+.png`,
      `/res/badge/${snapshot.gameVersion}/fs.png`,
      `/res/badge/${snapshot.gameVersion}/fs+.png`,
      `/res/badge/${snapshot.gameVersion}/fdx.png`,
      `/res/badge/${snapshot.gameVersion}/fdx+.png`,
      ...['percentage_blue', 'percentage_red', 'percentage_gold',
        'score_blue', 'score_red', 'score_gold', 'score_big_blue', 'score_big_red', 'score_big_gold',
        'score_num_count', 'score_num_count_big',
        'level_basic', 'level_advanced', 'level_expert', 'level_master', 'level_remaster']
        .map(path => `/res/numbers/${path}.png`),
      ...['score_table', 'fast_late', 'track_1', 'track_2', 'track_3',
        'dxscore', 'star_1', 'star_2', 'star_3']
        .map(path => `/res/songs/${path}.png`),
      ...['base', 'sync_base', 'sync', 'fc_base', 'fc', 'fc+', 'ap_base', 'ap', 'ap+',
        'fs_base', 'fs', 'fs+', 'fdx_base', 'fdx', 'fdx+']
        .map(path => `/res/icons/${path}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/song_${difficulty}.png`),
      ...Object.values(DIFFICULTY_ENUM).map(difficulty => `/res/songs/music_jacket_${difficulty}.png`),
      ...credit.tracks.map(s => s.cover),
    ];

    const cache: ImageCache = {};
    await Promise.all(
      imagesToCache.map(async (url) => {
        try {
          if (url.startsWith('data:')) return;
          return fetchImageForServer(url).then(async img => {
            let memo: Image | null = null;
            cache[url] = async () => memo || (memo = await loadImage(img));
          });
        } catch (error) {
          getLogger().warn({ err: error, url }, 'Failed to cache image');
        }
      })
    );

    // Render the image
    const canvas = await renderLastCreditImage(credit, snapshot, region, cache);
    const imageBuffer = Buffer.from(await canvas.toBuffer('jpg', { density: 2, quality: 0.9 }));

    // Plain content line, mirroring /profile and /daily styling
    const playedUnix = Math.floor(credit.playedAt.getTime() / 1000);
    const content = `<@${discordUserId}> Here are your recent plays at <t:${playedUnix}:f> (${regionName})`;

    // Create navigation buttons
    const components = [
      {
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip - 1}`,
            label: 'Newer Play',
            style: 2, // SECONDARY
            emoji: {
              name: '⬅️'
            },
            disabled: !hasNextCredit,
          },
          {
            type: 2, // BUTTON
            custom_id: `recents_${discordUserId}_${region}_${skip + 1}`,
            label: 'Older Play',
            style: 2, // SECONDARY
            emoji: {
              name: '➡️'
            },
            disabled: !hasPreviousCredit,
          },
        ],
      },
    ];

    // Send the image with plain content (no embed)
    await editDiscordMessageWithImageOnly(
      applicationId,
      interactionToken,
      content,
      imageBuffer,
      `maimai-recent-${region}.jpg`,
      components,
    );

  } catch (error) {
    getLogger().error({ err: error }, 'Error generating credit image');
    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [{
        title: '❌ Error',
        description: `Failed to generate image: ${error instanceof Error ? error.message : 'Unknown error'}`,
        color: DISCORD_COLORS.RED,
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
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
}

async function editDiscordMessageWithImageOnly(
  applicationId: string,
  interactionToken: string,
  content: string,
  imageBuffer: Buffer,
  filename: string,
  components?: any[],
): Promise<void> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/jpeg' });
  formData.append('files[0]', blob, filename);
  const payload: any = { content, embeds: [] };
  if (components) {
    payload.components = components;
  }
  formData.append('payload_json', JSON.stringify(payload));

  await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    { method: 'PATCH', body: formData },
  );
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
    const result = await prepareDailyPlaysData(userId, region, day);
    if (result.type === 'error') {
      await editDiscordMessage(applicationId, interactionToken, {
        content: `<@${discordUserId}> No plays found${day ? ` for ${day}` : ''} (${regionName}).`,
      });
      return;
    }

    const { plays, snapshot, day: resolvedDay } = result;

    const urls = [
      ...commonSnapshotResources(snapshot, region),
      ...plays.map(p => p.cover),
    ];

    const cache: ImageCache = {};
    await Promise.all(
      urls.map(async (url) => {
        try {
          const image = await loadCachedImage(url);
          cache[url] = async () => image;
        } catch (error) {
          getLogger().warn({ err: error, url }, 'Failed to cache image for daily plays');
        }
      })
    );

    const canvas = await renderDailyPlaysImage(plays, snapshot, region, resolvedDay, cache);
    const imageBuffer = Buffer.from(await canvas.toBuffer('jpg', { density: 2, quality: 0.85 }));

    await editDiscordMessageWithImageOnly(
      applicationId,
      interactionToken,
      `<@${discordUserId}> Daily plays for **${resolvedDay}** (${regionName})`,
      imageBuffer,
      `maimai-daily-${resolvedDay}.jpg`,
    );
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating daily plays image');
    await editDiscordMessage(applicationId, interactionToken, {
      content: `<@${discordUserId}> ❌ Failed to generate daily plays image.`,
    });
  }
}
