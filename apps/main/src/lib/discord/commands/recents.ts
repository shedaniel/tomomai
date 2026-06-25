import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import type { Region } from '@/lib/types';
import {
  createDeferredResponse,
  createErrorResponse,
  createNotRegisteredResponse,
  DiscordResponse,
} from '../responses';
import { resolveRegion } from '../region';
import { generateAndSendCreditImage } from '../image-utils';
import { applyStalenessGate } from './staleness';

export interface RecentsCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  skip?: number;
  forceFetch?: boolean;
}

export interface ExecuteRecentsOptions {
  dbUserId: string;
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  skip?: number;
}

export async function executeRecentsCommand({
  dbUserId,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  skip = 0,
}: ExecuteRecentsOptions): Promise<void> {
  await generateAndSendCreditImage({
    userId: dbUserId,
    discordUserId,
    region,
    applicationId,
    interactionToken,
    skip,
  });
}

export async function handleRecentsCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken,
  skip = 0,
  forceFetch,
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

    // Staleness/force-fetch only apply on the initial invocation, not pagination.
    if (!skip) {
      const gate = await applyStalenessGate({
        command: 'recents',
        dbUser: { id: dbUser.id, name: dbUser.name, username: dbUser.username, region: dbUser.region },
        region,
        discordUserId,
        forceFetch,
        payload: '',
        applicationId,
        interactionToken,
      });
      if (gate) return gate;
    }

    // Defer the response since image generation can take a moment
    const deferredResponse = createDeferredResponse();

    waitUntil(executeRecentsCommand({
      dbUserId: dbUser.id,
      region,
      discordUserId,
      applicationId,
      interactionToken,
      skip,
    }));

    return deferredResponse;

  } catch (error) {
    getLogger().error({ err: error }, 'Error handling recents command');
    return createErrorResponse('An error occurred while fetching your recent plays. Please try again later.');
  }
}
