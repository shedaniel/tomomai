import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import type { Region } from '@/lib/types';
import {
  createDeferredResponse,
  createErrorResponse,
  DiscordResponse,
  DISCORD_COLORS,
  editDiscordMessage,
} from '../responses';
import { regionDisplayName, resolveRegion } from '../region';
import { runFetchSession } from './fetch';
import { executeProfileCommand } from './profile';
import { executeRecentsCommand } from './recents';
import { executeRecommendCommand } from './recommend';
import { executeDailyCommand } from './daily';
import {
  getStalePromptResponse,
  isStale,
  type StaleCommand,
} from '../staleness';
import { getLatestSnapshotFetchedAt } from '@/server/queries/snapshots';

interface ResolvedUser {
  id: string;
  name: string;
  username: string | null;
  region: Region | null;
}

async function resolveDbUser(discordUserId: string): Promise<ResolvedUser | null> {
  const [dbUser] = await db
    .select({ id: user.id, name: user.name, username: user.username, region: user.region })
    .from(user)
    .innerJoin(account, eq(account.userId, user.id))
    .where(and(eq(account.accountId, discordUserId), eq(account.providerId, 'discord')))
    .limit(1);
  return dbUser ?? null;
}

async function runCommand(
  command: StaleCommand,
  dbUser: ResolvedUser,
  region: Region,
  discordUserId: string,
  applicationId: string,
  interactionToken: string,
  day?: string,
): Promise<void> {
  switch (command) {
    case 'profile':
      await executeProfileCommand({ dbUser, region, discordUserId, applicationId, interactionToken });
      break;
    case 'recents':
      await executeRecentsCommand({ dbUserId: dbUser.id, region, discordUserId, applicationId, interactionToken });
      break;
    case 'recommend':
      await executeRecommendCommand({ dbUserId: dbUser.id, region, discordUserId, applicationId, interactionToken });
      break;
    case 'daily':
      await executeDailyCommand({ dbUserId: dbUser.id, region, discordUserId, day, applicationId, interactionToken });
      break;
  }
}

export interface ApplyStalenessGateOptions {
  command: StaleCommand;
  dbUser: ResolvedUser;
  region: Region;
  discordUserId: string;
  forceFetch?: boolean;
  payload: string;
  day?: string;
  applicationId: string;
  interactionToken: string;
}

/**
 * Decide whether a data command should short-circuit before running.
 * Returns a `DiscordResponse` (force-refetch or staleness prompt) when it
 * should, or `null` when the command should proceed normally.
 */
export async function applyStalenessGate({
  command,
  dbUser,
  region,
  discordUserId,
  forceFetch,
  payload,
  day,
  applicationId,
  interactionToken,
}: ApplyStalenessGateOptions): Promise<DiscordResponse | null> {
  const regionName = regionDisplayName(region);

  if (forceFetch) {
    return runRefetchThenCommand({
      command,
      dbUser,
      region,
      discordUserId,
      applicationId,
      interactionToken,
      day,
    });
  }

  try {
    const lastFetchedAt = await getLatestSnapshotFetchedAt(dbUser.id, region);
    if (lastFetchedAt && isStale(lastFetchedAt)) {
      return getStalePromptResponse({
        command,
        discordUserId,
        region,
        regionName,
        lastFetchedAt,
        payload,
      });
    }
  } catch (error) {
    getLogger().error({ err: error }, 'Staleness check failed, proceeding with command');
  }

  return null;
}

export interface RunRefetchThenCommandOptions {
  command: StaleCommand;
  dbUser: ResolvedUser;
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  day?: string;
}

/**
 * Refetch from maimai DX NET, then run the given command. Shared by the
 * `forceFetch` slash-option path and the staleness "Refetch and continue"
 * button path. Returns a deferred response immediately.
 */
export function runRefetchThenCommand({
  command,
  dbUser,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  day,
}: RunRefetchThenCommandOptions): DiscordResponse {
  const deferredResponse = createDeferredResponse();

  const backgroundTask = (async () => {
    const regionName = regionDisplayName(region);
    try {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: `🔄 Refetching ${regionName} Data`,
          description: `<@${discordUserId}> Refetching from maimai DX NET, then continuing...`,
          color: DISCORD_COLORS.YELLOW,
          footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
          timestamp: new Date().toISOString(),
        }],
        components: [],
      });

      const ok = await runFetchSession({
        userId: dbUser.id,
        username: dbUser.username ?? dbUser.name,
        region,
        regionName,
        discordUserId,
        applicationId,
        interactionToken,
        onCompleted: async () => { /* command runs next */ },
      });

      if (!ok) return; // runFetchSession already posted the error/timeout embed

      await runCommand(command, dbUser, region, discordUserId, applicationId, interactionToken, day);
    } catch (error) {
      getLogger().error({ err: error }, 'Error in refetch-then-command');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '❌ Error',
          description: `<@${discordUserId}> An error occurred while refetching. Please try again later.`,
          color: DISCORD_COLORS.RED,
          footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  })();

  waitUntil(backgroundTask);

  return deferredResponse;
}

export interface HandleStalenessChoiceOptions {
  command: StaleCommand;
  discordUserId: string;
  region: Region;
  refetch: boolean;
  payload: string;
  applicationId: string;
  interactionToken: string;
}

/**
 * Handle a click on the staleness prompt buttons. `payload` carries the
 * `/daily` day (empty string = default day).
 */
export async function handleStalenessChoice({
  command,
  discordUserId,
  region,
  refetch,
  payload,
  applicationId,
  interactionToken,
}: HandleStalenessChoiceOptions): Promise<DiscordResponse> {
  if (!discordUserId) {
    return createErrorResponse('Unable to identify Discord user.');
  }

  const dbUser = await resolveDbUser(discordUserId);
  if (!dbUser) {
    return createErrorResponse('Unable to find your account. Please try again.');
  }

  const resolvedRegion = resolveRegion(region, dbUser.region);
  const day = command === 'daily' && payload ? payload : undefined;

  if (refetch) {
    return runRefetchThenCommand({
      command,
      dbUser,
      region: resolvedRegion,
      discordUserId,
      applicationId,
      interactionToken,
      day,
    });
  }

  const deferredResponse = createDeferredResponse();

  const backgroundTask = (async () => {
    try {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '⏳ Loading...',
          description: `<@${discordUserId}> Continuing with your current data...`,
          color: DISCORD_COLORS.BLURPLE,
          footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
          timestamp: new Date().toISOString(),
        }],
        components: [],
      });
      await runCommand(command, dbUser, resolvedRegion, discordUserId, applicationId, interactionToken, day);
    } catch (error) {
      getLogger().error({ err: error }, 'Error in staleness continue path');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '❌ Error',
          description: `<@${discordUserId}> An error occurred. Please try again later.`,
          color: DISCORD_COLORS.RED,
          footer: { text: 'tomomai ともマイ • maimai DX score tracker' },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  })();

  waitUntil(backgroundTask);

  return deferredResponse;
}
