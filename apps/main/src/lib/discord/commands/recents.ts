import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { generateAndSendCreditImage } from '../image-utils';

export interface RecentsCommandOptions {
  discordUserId: string;
  region: 'intl' | 'jp';
  applicationId: string;
  interactionToken: string;
  skip?: number;
}

export async function handleRecentsCommand({
  discordUserId,
  region,
  applicationId,
  interactionToken,
  skip = 0,
}: RecentsCommandOptions): Promise<DiscordResponse> {
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

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    // Generate and send credit image in the background
    const backgroundTask = (async () => {
      await generateAndSendCreditImage({
        userId: dbUser.id,
        discordUserId,
        region,
        applicationId,
        interactionToken,
        skip,
      });
    })();

    // Use waitUntil to ensure the background task continues
    waitUntil(backgroundTask);

    return deferredResponse;

  } catch (error) {
    getLogger().error({ err: error }, 'Error handling recents command');
    return createErrorResponse('An error occurred while fetching your recent plays. Please try again later.');
  }
}
