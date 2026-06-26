import { InteractionResponseType } from 'discord-interactions';
import type { DiscordResponse } from './responses';
import { DISCORD_COLORS } from './responses';
import { t } from './i18n';

/** Prompt the user when their data is older than this. */
export const STALE_THRESHOLD_MS = 1 * 60 * 60 * 1000;

export type StaleCommand = 'profile' | 'recents' | 'recommend' | 'daily';

export function isStale(lastFetchedAt: Date, now: number = Date.now()): boolean {
  return now - lastFetchedAt.getTime() > STALE_THRESHOLD_MS;
}

/** Humanize an elapsed duration as "3 days", "2 hours", "5 minutes", "just now". */
export function formatRelativeAge(past: Date, locale?: string, now: number = Date.now()): string {
  const ms = Math.max(0, now - past.getTime());
  const sec = Math.floor(ms / 1000);
  if (sec < 45) return t(locale, 'age.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? t(locale, 'age.minute') : t(locale, 'age.minutes', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr === 1 ? t(locale, 'age.hour') : t(locale, 'age.hours', { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return day === 1 ? t(locale, 'age.day') : t(locale, 'age.days', { count: day });
  const month = Math.floor(day / 30);
  if (day < 365) return month === 1 ? t(locale, 'age.month') : t(locale, 'age.months', { count: month });
  const year = Math.floor(day / 365);
  return year === 1 ? t(locale, 'age.year') : t(locale, 'age.years', { count: year });
}

function commandSpecificLine(command: StaleCommand, payload: string, locale?: string): string {
  switch (command) {
    case 'profile':
      return t(locale, 'staleness.cmdLine.profile');
    case 'recents':
      return t(locale, 'staleness.cmdLine.recents');
    case 'recommend':
      return t(locale, 'staleness.cmdLine.recommend');
    case 'daily':
      return payload
        ? t(locale, 'staleness.cmdLine.daily', { day: payload })
        : t(locale, 'staleness.cmdLine.dailyDefault');
    default:
      return t(locale, 'staleness.cmdLine.default');
  }
}

export interface StalePromptOptions {
  command: StaleCommand;
  discordUserId: string;
  region: string;
  regionName: string;
  lastFetchedAt: Date;
  payload: string;
  locale?: string;
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
  locale,
}: StalePromptOptions): DiscordResponse {
  const age = formatRelativeAge(lastFetchedAt, locale);
  const cmdLine = commandSpecificLine(command, payload, locale);
  const description = t(locale, 'staleness.description', { userId: discordUserId, regionName, age, cmdLine });

  const customId = (choice: 0 | 1) =>
    `staleness_${command}_${discordUserId}_${region}_${choice}_${payload}`;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [{
        title: t(locale, 'staleness.title'),
        description,
        color: DISCORD_COLORS.YELLOW,
        footer: {
          text: t(locale, 'common.footer'),
        },
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1, // ACTION_ROW
        components: [
          {
            type: 2, // BUTTON
            style: 2, // SECONDARY
            label: t(locale, 'staleness.buttons.continue'),
            custom_id: customId(0),
          },
          {
            type: 2, // BUTTON
            style: 1, // PRIMARY
            label: t(locale, 'staleness.buttons.refetchAndContinue'),
            custom_id: customId(1),
          },
        ],
      }],
    },
  };
}
