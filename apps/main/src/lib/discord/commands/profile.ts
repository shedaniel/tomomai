import { db } from '@/lib/db';
import { account, user, userSnapshots } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, desc, eq } from 'drizzle-orm';
import { generateAndSendProfileImage } from '../image-utils';
import {
  createDeferredResponse,
  createErrorResponse,
  createNoDataResponse,
  createNotRegisteredResponse,
  DISCORD_COLORS,
  DiscordResponse,
  editDiscordMessage,
  getRatingComment
} from '../responses';

export interface ProfileCommandOptions {
  discordUserId: string;
  region: 'intl' | 'jp';
  applicationId: string;
  interactionToken: string;
}

export async function handleProfileCommand({
  discordUserId,
  region,
  applicationId,
  interactionToken
}: ProfileCommandOptions): Promise<DiscordResponse> {
  const regionName = region === 'jp' ? 'Japan' : 'International';

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

    // Get latest snapshot for the region
    const [latestSnapshot] = await db
      .select({
        publicId: userSnapshots.publicId,
        rating: userSnapshots.rating,
        stars: userSnapshots.stars,
        totalPlayCount: userSnapshots.totalPlayCount,
        fetchedAt: userSnapshots.fetchedAt,
      })
      .from(userSnapshots)
      .where(and(
        eq(userSnapshots.userId, dbUser.id),
        eq(userSnapshots.region, region)
      ))
      .orderBy(desc(userSnapshots.fetchedAt))
      .limit(1);

    if (!latestSnapshot) {
      return createNoDataResponse(regionName);
    }

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    // Generate and send profile image in the background
    const backgroundTask = (async () => {
      try {
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

        // Generate and send the profile image
        await new Promise(resolve => setTimeout(resolve, 500));
        await generateAndSendProfileImage({
          snapshot: latestSnapshot,
          discordUserId,
          regionName,
          applicationId,
          interactionToken,
          title: `🎯 ${regionName} Region Rating`,
          username: dbUser.username ?? dbUser.name,
        });
      } catch (error) {
        getLogger().error({ err: error }, 'Error generating profile image');
        // Fallback to text-only response
        const rating = latestSnapshot.rating;
        const comment = getRatingComment(rating);

        await editDiscordMessage(applicationId, interactionToken, {
          embeds: [{
            title: `🎯 ${regionName} Region Rating`,
            description: `<@${discordUserId}> ${comment}, you only have **${rating}** rating! 😤`,
            color: DISCORD_COLORS.BLURPLE,
            fields: [
              {
                name: '⭐ Stars',
                value: latestSnapshot.stars.toString(),
                inline: true,
              },
              {
                name: '🎮 Total Plays',
                value: latestSnapshot.totalPlayCount.toString(),
                inline: true,
              },
              {
                name: '📅 Last Updated',
                value: `<t:${Math.floor(latestSnapshot.fetchedAt.getTime() / 1000)}:R>`,
                inline: true,
              },
            ],
            footer: {
              text: 'tomomai ともマイ • maimai DX score tracker',
            },
            timestamp: new Date().toISOString(),
          }],
        });
      }
    })();

    // Use waitUntil to ensure the background task continues after response
    waitUntil(backgroundTask);

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error fetching user rating');
    return createErrorResponse('An error occurred while fetching your rating. Please try again later.');
  }
}
