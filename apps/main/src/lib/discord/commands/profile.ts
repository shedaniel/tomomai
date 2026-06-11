import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
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

export interface ProfileCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
}

export async function handleProfileCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken
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
    const regionName = regionDisplayName(region);

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    // Generate and send profile in the background
    const backgroundTask = (async () => {
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
        // Generate and send the profile image with the simple roast text
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
        // Fallback to text-only roast
        await editDiscordMessage(applicationId, interactionToken, {
          content: formatProfileSummaryContent(discordUserId, summary, regionName),
          embeds: [],
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
