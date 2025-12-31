import { db } from '@/lib/db';
import { account, songs, user, userRecentSongs } from '@/lib/db/schema-pg';
import { resolveBaseUrl } from '@/lib/base-url';
import { getVersionFromDate } from '@/lib/metadata';
import { calculateSongRating } from '@/lib/rating-calculator';
import { Difficulty } from '@/lib/types';
import { createSafeMaimaiImageUrl } from '@/lib/utils';
import { InteractionResponseType } from 'discord-interactions';
import { and, desc, eq } from 'drizzle-orm';
import {
  createErrorResponse,
  createNotRegisteredResponse,
  DISCORD_COLORS,
  DiscordEmbed,
  DiscordResponse,
} from '../responses';
import { renderLevelPrecise } from '@/lib/name-utils';

export interface RecentsCommandOptions {
  discordUserId: string;
  region: 'intl' | 'jp';
  applicationId: string;
  interactionToken: string;
  skip?: number;
}

// Helper function to format difficulty display
function formatDifficulty(difficulty: Difficulty): string {
  const difficultyMap: Record<Difficulty, string> = {
    basic: 'Basic',
    advanced: 'Advanced',
    expert: 'Expert',
    master: 'Master',
    remaster: 'Re:MASTER',
    utage: 'Utage'
  };
  return difficultyMap[difficulty];
}

// Helper function to format chart type display
function formatType(type: 'std' | 'dx'): string {
  return type === 'std' ? 'STD' : 'DX';
}

// Helper function to format achievement display
function formatAchievement(achievement: number): string {
  return (achievement / 10000).toFixed(4) + '%';
}

// Helper function to fetch and format recent plays data
async function fetchRecentPlaysData(userId: string, region: 'intl' | 'jp', skip: number = 0) {
  // Calculate offset: we need to skip entire plays, not individual tracks
  // Fetch extra tracks to check if there are more plays available
  const maxTracksToFetch = 4 * (skip + 2); // Fetch current play + 1 extra to check if more exist

  const recentPlays = await db
    .select({
      id: userRecentSongs.id,
      songId: userRecentSongs.songId,
      playedAt: userRecentSongs.playedAt,
      achievement: userRecentSongs.archievement, // Note: typo in schema
      dxScore: userRecentSongs.dxScore,
      maxDxScore: userRecentSongs.maxDxScore,
      fc: userRecentSongs.fc,
      fs: userRecentSongs.fs,
      track: userRecentSongs.track,
      songName: songs.songName,
      artist: songs.artist,
      cover: songs.cover,
      difficulty: songs.difficulty,
      level: songs.level,
      levelPrecise: songs.levelPrecise,
      type: songs.type,
      addedVersion: songs.addedVersion,
    })
    .from(userRecentSongs)
    .innerJoin(songs, eq(userRecentSongs.songId, songs.id))
    .where(and(
      eq(userRecentSongs.userId, userId),
      eq(songs.region, region)
    ))
    .orderBy(desc(userRecentSongs.playedAt))
    .limit(maxTracksToFetch);

  if (recentPlays.length === 0) {
    return null;
  }

  // Group tracks into plays
  type TrackData = typeof recentPlays[0];
  const plays: TrackData[][] = [];
  let currentPlayTracks: TrackData[] = [];

  for (let i = 0; i < recentPlays.length; i++) {
    const track = recentPlays[i];
    currentPlayTracks.push(track);

    // Check if this is the last track of a play (track number increases or we're at the end)
    const isLastTrack = i === recentPlays.length - 1 || recentPlays[i + 1].track > track.track;

    if (isLastTrack) {
      plays.push([...currentPlayTracks]);
      currentPlayTracks = [];
    }
  }

  // Get the play at the skip index
  if (skip >= plays.length) {
    return null; // No more plays
  }

  const targetPlay = plays[skip];
  // hasNextPlay = can go to newer plays (decrease skip)
  const hasNextPlay = skip > 0;
  // hasPreviousPlay = can go to older plays (increase skip)
  const hasPreviousPlay = skip + 1 < plays.length;

  return {
    tracks: targetPlay,
    hasNextPlay,
    hasPreviousPlay,
  };
}

// Helper function to create embeds from play data
function createPlayEmbeds(tracks: any[], region: 'intl' | 'jp') {
  const playTime = tracks[0].playedAt;
  const version = getVersionFromDate(playTime, region);

  return tracks.map((play, index) => {
    // Calculate rating
    const rating = calculateSongRating({
      achievement: play.achievement,
      fc: play.fc,
      levelPrecise: play.levelPrecise,
      addedVersion: play.addedVersion,
    }, version);

    // Proxy the cover image URL
    let coverUrl = createSafeMaimaiImageUrl(play.cover);

    // If the URL is relative (starts with /), prefix with base URL for Discord
    if (coverUrl.startsWith('/')) {
      coverUrl = resolveBaseUrl() + coverUrl;
    }

    let songName = play.songName;
    if (songName.length > 24) {
      songName = songName.slice(0, 24 - 3) + '...';
    }

    let artist = play.artist;
    if (artist.length > 32) {
      artist = artist.slice(0, 32 - 3) + '...';
    }

    return {
      title: `🎵 Track ${index + 1}`,
      description: `**${songName}**\n-# ${artist}`,
      color: DISCORD_COLORS.BLURPLE,
      thumbnail: {
        url: coverUrl,
        width: 190,
        height: 190,
      },
      fields: [
        {
          name: 'Achievement',
          value: formatAchievement(play.achievement),
          inline: true,
        },
        {
          name: 'Rating',
          value: `${Math.floor(rating)}`,
          inline: true,
        },
        {
          name: 'Level',
          value: `${play.level} (${renderLevelPrecise(play.levelPrecise, play.difficulty)})`,
          inline: true,
        },
        {
          name: 'Difficulty',
          value: formatDifficulty(play.difficulty),
          inline: true,
        },
        {
          name: 'Type',
          value: formatType(play.type),
          inline: true,
        },
        {
          name: 'FC/FS',
          value: ((play.fc === 'none' ? '' : play.fc.toUpperCase()) + (play.fs === 'none' ? '' : ' ' + play.fs.toUpperCase())).trim() ?? '-',
          inline: true,
        },
      ],
      footer: index === tracks.length - 1 ? {
        text: `tomomai ともマイ • maimai DX score tracker`,
      } : undefined,
      timestamp: index === tracks.length - 1 ? playTime.toISOString() : undefined,
    };
  });
}

// Helper function to create navigation buttons
function createNavigationButtons(discordUserId: string, region: 'intl' | 'jp', skip: number, hasNextPlay: boolean, hasPreviousPlay: boolean) {
  return [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          custom_id: `recents_${discordUserId}_${region}_${skip - 1}`,
          label: 'Next Play',
          style: 2, // SECONDARY
          emoji: {
            name: '⬅️'
          },
          disabled: !hasNextPlay,
        },
        {
          type: 2, // BUTTON
          custom_id: `recents_${discordUserId}_${region}_${skip + 1}`,
          label: 'Previous Play',
          style: 2, // SECONDARY
          emoji: {
            name: '➡️'
          },
          disabled: !hasPreviousPlay,
        },
      ],
    },
  ];
}

export async function handleRecentsCommand({
  discordUserId,
  region,
  applicationId,
  interactionToken,
  skip = 0,
}: RecentsCommandOptions): Promise<DiscordResponse> {
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

    // Fetch recent plays data
    const playData = await fetchRecentPlaysData(dbUser.id, region, skip);

    if (!playData) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
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
        },
      };
    }

    // Create embeds for each track
    const embeds = createPlayEmbeds(playData.tracks, region);

    // Create navigation buttons
    const components = createNavigationButtons(discordUserId, region, skip, playData.hasNextPlay, playData.hasPreviousPlay);

    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds,
        components,
      },
    };

  } catch (error) {
    console.error('Error handling recents command:', error);
    return createErrorResponse('An error occurred while fetching your recent plays. Please try again later.');
  }
}
