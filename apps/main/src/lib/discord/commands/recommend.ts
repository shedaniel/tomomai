import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { renderLevelPrecise } from '@/lib/name-utils';
import { addRatingsAndSort, SongWithRating } from '@/lib/rating-calculator';
import { SongWithScore, Region } from '@/lib/types';
import { fetchLatestSnapshotData } from '@/server/queries/snapshots';
import { generateRecommendations, RecommendationData } from '@/server/queries/recommendations';
import { getLogger } from '@/lib/request-logger';
import { waitUntil } from '@vercel/functions';
import { and, eq } from 'drizzle-orm';
import {
  createDeferredResponse,
  createErrorResponse,
  createNoDataResponse,
  createNotRegisteredResponse,
  DISCORD_COLORS,
  DiscordResponse,
  editDiscordMessage,
} from '../responses';
import { regionDisplayName, resolveRegion } from '../region';
import { applyStalenessGate } from './staleness';
import { t } from '../i18n';

export interface RecommendCommandOptions {
  discordUserId: string;
  regionParam?: string;
  applicationId: string;
  interactionToken: string;
  forceFetch?: boolean;
  locale?: string;
}

export interface ExecuteRecommendOptions {
  dbUserId: string;
  region: Region;
  discordUserId: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export async function executeRecommendCommand({
  dbUserId,
  region,
  discordUserId,
  applicationId,
  interactionToken,
  locale,
}: ExecuteRecommendOptions): Promise<void> {
  const regionName = regionDisplayName(region, locale);
  try {
    const data = await fetchLatestSnapshotData(dbUserId, region);
    if (!data) {
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [createNoDataResponse(regionName, locale).data!.embeds![0]],
      });
      return;
    }

    const { snapshot, songs } = data;
    const songsWithRating = addRatingsAndSort(songs as SongWithScore[], snapshot.gameVersion) as SongWithRating[];
    const recommendations = generateRecommendations(songsWithRating, snapshot.gameVersion);

    const deduped = recommendations.filter((rec, index, self) =>
      index === self.findIndex(r => r.song.songId === rec.song.songId && r.song.difficulty === rec.song.difficulty)
    );

    const embed = deduped.length === 0
      ? buildNoRecommendationsEmbed(regionName, discordUserId, locale)
      : buildRecommendationEmbed(deduped, regionName, discordUserId, locale);

    await editDiscordMessage(applicationId, interactionToken, {
      embeds: [embed],
    });
  } catch (error) {
    getLogger().error({ err: error }, 'Error generating recommendations');
    await editDiscordMessage(applicationId, interactionToken, {
      content: t(locale, 'recommend.errorContent'),
    });
  }
}

const MAX_ROWS = 10;

function difficultyShort(difficulty: string): string {
  switch (difficulty) {
    case 'basic': return 'BAS';
    case 'advanced': return 'ADV';
    case 'expert': return 'EXP';
    case 'master': return 'MAS';
    case 'remaster': return 'REM';
    case 'utage': return 'UTG';
    default: return difficulty.slice(0, 3).toUpperCase();
  }
}

function categoryTag(rec: RecommendationData): string {
  if (rec.isInBest) return rec.category === 'new' ? 'B15' : 'B35';
  return rec.category === 'new' ? 'NEW' : 'OLD';
}

// Floor to 2 decimals so 99.9956% doesn't render as 100.00%
function formatAccuracy(accuracy: number): string {
  return (Math.floor(accuracy * 100) / 100).toFixed(2);
}

function formatRow(rec: RecommendationData, rank: number): string {
  const { song, currentAccuracy, targetAccuracy, currentRating, targetRating, ratingGain } = rec;
  const tag = categoryTag(rec);
  const diff = difficultyShort(song.difficulty);
  const lvl = renderLevelPrecise(song.levelPrecise, song.difficulty);
  const target = targetAccuracy === 101.0 ? 'AP' : `${formatAccuracy(targetAccuracy)}%`;
  const rankStr = `#${rank}`.padEnd(3);
  return [
    `${rankStr} [${tag}] ${song.songName} (${diff} ${lvl})`,
    `    ${formatAccuracy(currentAccuracy)}% → ${target}   rating ${currentRating} → ${targetRating}   (+${ratingGain})`,
  ].join('\n');
}

function buildRecommendationEmbed(recommendations: RecommendationData[], regionName: string, discordUserId: string, locale?: string) {
  const top = recommendations.slice(0, MAX_ROWS);
  const body = top.map((r, i) => formatRow(r, i + 1)).join('\n');

  return {
    title: t(locale, 'recommend.title', { regionName }),
    description: t(locale, 'recommend.description', { userId: discordUserId, body }),
    color: DISCORD_COLORS.BLURPLE,
    footer: {
      text: t(locale, 'common.footer'),
    },
    timestamp: new Date().toISOString(),
  };
}

function buildNoRecommendationsEmbed(regionName: string, discordUserId: string, locale?: string) {
  return {
    title: t(locale, 'recommend.none.title', { regionName }),
    description: t(locale, 'recommend.none.description', { userId: discordUserId }),
    color: DISCORD_COLORS.GREEN,
    footer: {
      text: t(locale, 'common.footer'),
    },
    timestamp: new Date().toISOString(),
  };
}

export async function handleRecommendCommand({
  discordUserId,
  regionParam,
  applicationId,
  interactionToken,
  forceFetch,
  locale,
}: RecommendCommandOptions): Promise<DiscordResponse> {
  try {
    if (!discordUserId) {
      return createErrorResponse(t(locale, 'common.error.unableToIdentify'), locale);
    }

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
      command: 'recommend',
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

    const deferredResponse = createDeferredResponse();

    waitUntil(executeRecommendCommand({
      dbUserId: dbUser.id,
      region,
      discordUserId,
      applicationId,
      interactionToken,
      locale,
    }));

    return deferredResponse;
  } catch (error) {
    getLogger().error({ err: error }, 'Error handling recommend command');
    return createErrorResponse(t(locale, 'recommend.errorGeneric'), locale);
  }
}
