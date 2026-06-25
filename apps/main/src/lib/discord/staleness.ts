import { InteractionResponseType } from 'discord-interactions';
import type { DiscordResponse } from './responses';
import { DISCORD_COLORS } from './responses';

/** Prompt the user when their data is older than this. */
export const STALE_THRESHOLD_MS = 1 * 60 * 60 * 1000;

export type StaleCommand = 'profile' | 'recents' | 'recommend' | 'daily';

export function isStale(lastFetchedAt: Date, now: number = Date.now()): boolean {
  return now - lastFetchedAt.getTime() > STALE_THRESHOLD_MS;
}

/** Humanize an elapsed duration as "3 days", "2 hours", "5 minutes", "just now". */
export function formatRelativeAge(past: Date, now: number = Date.now()): string {
  const ms = Math.max(0, now - past.getTime());
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? '1 minute' : `${min} minutes`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour' : `${hr} hours`;
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? '1 day' : `${day} days`;
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? '1 month' : `${month} months`;
  const year = Math.floor(day / 365);
  return year === 1 ? '1 year' : `${year} years`;
}

function commandSpecificLine(command: StaleCommand, payload: string): string {
  switch (command) {
    case 'profile':
      return 'Do you still want to view your profile?';
    case 'recents':
      return 'Do you still want to view your recent plays?';
    case 'recommend':
      return 'Do you still want to view your recommendations?';
    case 'daily':
      return payload
        ? `Do you still want to generate your daily plays for ${payload}?`
        : 'Do you still want to generate your daily plays?';
    default:
      return 'Do you want to continue?';
  }
}

export interface StalePromptOptions {
  command: StaleCommand;
  discordUserId: string;
  region: string;
  regionName: string;
  lastFetchedAt: Date;
  payload: string;
}

/**
 * Build the "your last fetch was X ago" message with Continue / Refetch
 * buttons. `payload` is currently only used by `/daily` to carry the day.
 */
export function getStalePromptResponse({
  command,
  discordUserId,
  region,
  regionName,
  lastFetchedAt,
  payload,
}: StalePromptOptions): DiscordResponse {
  const age = formatRelativeAge(lastFetchedAt);
  const description =
    `<@${discordUserId}> Your last **${regionName}** fetch was **${age}** ago.\n` +
    commandSpecificLine(command, payload);

  const customId = (choice: 0 | 1) =>
    `staleness_${command}_${discordUserId}_${region}_${choice}_${payload}`;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [{
        title: '⏳ Stale Data',
        description,
        color: DISCORD_COLORS.YELLOW,
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
        },
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            style: 2, // SECONDARY
            label: 'Continue',
            custom_id: customId(0),
          },
          {
            type: 2, // BUTTON
            style: 1, // PRIMARY
            label: 'Refetch and continue',
            custom_id: customId(1),
          },
        ],
      }],
    },
  };
}
