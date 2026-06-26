import { handleFetchCommand } from './commands/fetch';
import { handleInviteCommand } from './commands/invite';
import { handleProfileCommand } from './commands/profile';
import { handleRecentsCommand } from './commands/recents';
import { handleRecommendCommand } from './commands/recommend';
import { handleAlbumPreferenceSelection } from './commands/album-preference';
import { handleDailyCommand, handleDailyAutocomplete } from './commands/daily';
import { createUnknownCommandResponse, DiscordResponse } from './responses';
import type { Region } from '@/lib/types';
import type { StaleCommand } from './staleness';
import { handleStalenessChoice } from './commands/staleness';

type CommandOption = { name: string; value?: string | boolean; type: number; focused?: boolean };

// Command definitions. Each data command defaults to the user's selected
// region and accepts an optional `region` option to override it.
export const COMMANDS = {
  INVITE: {
    name: 'invite',
    description: 'Get an invite link to add tomomai ともマイ bot to your server',
  },
  PROFILE: {
    name: 'profile',
    description: 'Show your latest maimai rating',
  },
  FETCH: {
    name: 'fetch',
    description: 'Refetch and update your latest maimai scores',
  },
  RECENTS: {
    name: 'recents',
    description: 'Show your most recent play',
  },
  RECOMMEND: {
    name: 'recommend',
    description: 'Show song recommendations to improve your rating',
  },
  DAILY: {
    name: 'daily',
    description: 'Show your plays from a single JST day',
  },
} as const;

function getRegionParam(options?: CommandOption[]): string | undefined {
  const value = options?.find(o => o.name === 'region')?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getBooleanParam(options: CommandOption[] | undefined, name: string): boolean {
  const value = options?.find(o => o.name === name)?.value;
  return value === true || value === 'true';
}

export interface CommandContext {
  commandName: string;
  options?: CommandOption[];
  discordUserId?: string;
  applicationId: string;
  interactionToken: string;
  forceFetch?: boolean;
  locale?: string;
}

export interface ComponentContext {
  customId: string;
  discordUserId?: string;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export interface AutocompleteContext {
  commandName: string;
  options?: CommandOption[];
  discordUserId?: string;
  locale?: string;
}

export async function handleCommand(context: CommandContext): Promise<DiscordResponse> {
  const { commandName, options, discordUserId, applicationId, interactionToken, forceFetch, locale } = context;

  const regionParam = getRegionParam(options);
  const forceFetchParam = forceFetch ?? getBooleanParam(options, 'fetch');

  switch (commandName.toLowerCase()) {
    case COMMANDS.PROFILE.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      return handleProfileCommand({
        discordUserId,
        regionParam,
        applicationId,
        interactionToken,
        forceFetch: forceFetchParam,
        locale,
      });

    case COMMANDS.FETCH.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      return handleFetchCommand({
        discordUserId,
        regionParam,
        applicationId,
        interactionToken,
        locale,
      });
      // /fetch ignores the `fetch` boolean option on purpose.

    case COMMANDS.RECENTS.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      return handleRecentsCommand({
        discordUserId,
        regionParam,
        applicationId,
        interactionToken,
        forceFetch: forceFetchParam,
        locale,
      });

    case COMMANDS.RECOMMEND.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      return handleRecommendCommand({
        discordUserId,
        regionParam,
        applicationId,
        interactionToken,
        forceFetch: forceFetchParam,
        locale,
      });

    case COMMANDS.DAILY.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const dateOption = options?.find(o => o.name === 'date');
      const day = typeof dateOption?.value === 'string' && dateOption.value.length > 0
        ? dateOption.value
        : undefined;
      return handleDailyCommand({
        discordUserId,
        regionParam,
        day,
        applicationId,
        interactionToken,
        forceFetch: forceFetchParam,
        locale,
      });

    case COMMANDS.INVITE.name.toLowerCase():
      return handleInviteCommand({ applicationId, locale });

    default:
      return createUnknownCommandResponse();
  }
}

export async function handleAutocomplete(context: AutocompleteContext): Promise<DiscordResponse> {
  const { commandName, options, discordUserId, locale } = context;

  switch (commandName.toLowerCase()) {
    case COMMANDS.DAILY.name.toLowerCase(): {
      const regionParam = getRegionParam(options);
      const focused = options?.find(o => o.focused) ?? options?.find(o => o.name === 'date');
      const focusedValue = typeof focused?.value === 'string' ? focused.value : '';
      return handleDailyAutocomplete({ discordUserId, regionParam, focusedValue, locale });
    }
    default:
      return { type: 8, data: { choices: [] } };
  }
}

export async function handleComponents(context: ComponentContext): Promise<DiscordResponse | null> {
  const { customId, discordUserId, applicationId, interactionToken, locale } = context;

  // Parse the custom_id: recents_<userId>_<region>_<skip>
  if (customId.startsWith('recents_')) {
    const parts = customId.split('_');
    if (parts.length === 4) {
      const buttonUserId = parts[1];
      const region = parts[2];
      const skip = parseInt(parts[3], 10);

      // verify the user clicking is the same as the user who initiated the command
      if (!discordUserId || discordUserId !== buttonUserId) {
        return null;
      }

      return handleRecentsCommand({
        discordUserId,
        regionParam: region,
        applicationId,
        interactionToken,
        skip,
        locale,
      });
    }
  }

  // Parse the custom_id: album_preference_<userId>_<region>_<choice>
  if (customId.startsWith('album_preference_')) {
    const parts = customId.split('_');
    if (parts.length === 5) {
      const buttonUserId = parts[2];
      const region = parts[3] as Region;
      const choice = parts[4];

      // verify the user clicking is the same as the user who initiated the command
      if (!discordUserId || discordUserId !== buttonUserId) {
        return null;
      }

      const fetchUseAlbums = choice === '1';

      return handleAlbumPreferenceSelection({
        discordUserId,
        region,
        fetchUseAlbums,
        applicationId,
        interactionToken,
        locale,
      });
    }
  }

  // Parse the custom_id: staleness_<cmd>_<userId>_<region>_<choice>_<payload>
  if (customId.startsWith('staleness_')) {
    const parts = customId.split('_');
    // staleness _ cmd _ userId _ region _ choice _ payload(payload may be empty)
    if (parts.length >= 6) {
      const cmd = parts[1];
      const buttonUserId = parts[2];
      const region = parts[3] as Region;
      const refetch = parts[4] === '1';
      const payload = parts.slice(5).join('_');

      // verify the user clicking is the same as the user who initiated the command
      if (!discordUserId || discordUserId !== buttonUserId) {
        return null;
      }

      return handleStalenessChoice({
        command: cmd as StaleCommand,
        discordUserId,
        region,
        refetch,
        payload,
        applicationId,
        interactionToken,
        locale,
      });
    }
  }

  return null;
}
