import { handleFetchCommand } from './commands/fetch';
import { handleInviteCommand } from './commands/invite';
import { handleProfileCommand } from './commands/profile';
import { handleRecentsCommand } from './commands/recents';
import { handleRecommendCommand } from './commands/recommend';
import { handleAlbumPreferenceSelection } from './commands/album-preference';
import { handleDailyCommand, handleDailyAutocomplete } from './commands/daily';
import { createUnknownCommandResponse, DiscordResponse } from './responses';

type CommandOption = { name: string; value?: string; type: number; focused?: boolean };

// Command definitions
export const COMMANDS = {
  INVITE: {
    name: 'invite',
    description: 'Get an invite link to add tomomai ともマイ bot to your server',
  },
  PROFILE: {
    name: 'profile',
    description: 'Show your latest maimai rating (International region)',
  },
  PROFILEJP: {
    name: 'profilejp',
    description: 'Show your latest maimai rating (Japan region)',
  },
  FETCH: {
    name: 'fetch',
    description: 'Refetch and update your latest maimai scores (International region)',
  },
  FETCHJP: {
    name: 'fetchjp',
    description: 'Refetch and update your latest maimai scores (Japan region)',
  },
  RECENTS: {
    name: 'recents',
    description: 'Show your most recent play (International region)',
  },
  RECENTSJP: {
    name: 'recentsjp',
    description: 'Show your most recent play (Japan region)',
  },
  RECOMMEND: {
    name: 'recommend',
    description: 'Show song recommendations to improve your rating (International region)',
  },
  RECOMMENDJP: {
    name: 'recommendjp',
    description: 'Show song recommendations to improve your rating (Japan region)',
  },
  DAILY: {
    name: 'daily',
    description: 'Show your plays from a single JST day (International region)',
  },
  DAILYJP: {
    name: 'dailyjp',
    description: 'Show your plays from a single JST day (Japan region)',
  },
} as const;

export interface CommandContext {
  commandName: string;
  options?: CommandOption[];
  discordUserId?: string;
  applicationId: string;
  interactionToken: string;
}

export interface ComponentContext {
  customId: string;
  discordUserId?: string;
  applicationId: string;
  interactionToken: string;
}

export interface AutocompleteContext {
  commandName: string;
  options?: CommandOption[];
  discordUserId?: string;
}

export async function handleCommand(context: CommandContext): Promise<DiscordResponse> {
  const { commandName, options, discordUserId, applicationId, interactionToken } = context;

  switch (commandName.toLowerCase()) {
    case COMMANDS.PROFILE.name.toLowerCase():
    case COMMANDS.PROFILEJP.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const region = commandName.toLowerCase() === 'profilejp' ? 'jp' : 'intl';
      return handleProfileCommand({
        discordUserId,
        region,
        applicationId,
        interactionToken
      });

    case COMMANDS.FETCH.name.toLowerCase():
    case COMMANDS.FETCHJP.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const fetchRegion = commandName.toLowerCase() === 'fetchjp' ? 'jp' : 'intl';
      return handleFetchCommand({
        discordUserId,
        region: fetchRegion,
        applicationId,
        interactionToken
      });

    case COMMANDS.RECENTS.name.toLowerCase():
    case COMMANDS.RECENTSJP.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const recentsRegion = commandName.toLowerCase() === 'recentsjp' ? 'jp' : 'intl';
      return handleRecentsCommand({
        discordUserId,
        region: recentsRegion,
        applicationId,
        interactionToken
      });

    case COMMANDS.RECOMMEND.name.toLowerCase():
    case COMMANDS.RECOMMENDJP.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const recommendRegion = commandName.toLowerCase() === 'recommendjp' ? 'jp' : 'intl';
      return handleRecommendCommand({
        discordUserId,
        region: recommendRegion,
        applicationId,
        interactionToken
      });

    case COMMANDS.DAILY.name.toLowerCase():
    case COMMANDS.DAILYJP.name.toLowerCase():
      if (!discordUserId) {
        return createUnknownCommandResponse();
      }
      const dailyRegion = commandName.toLowerCase() === 'dailyjp' ? 'jp' : 'intl';
      const dateOption = options?.find(o => o.name === 'date');
      const day = typeof dateOption?.value === 'string' && dateOption.value.length > 0
        ? dateOption.value
        : undefined;
      return handleDailyCommand({
        discordUserId,
        region: dailyRegion,
        day,
        applicationId,
        interactionToken,
      });

    case COMMANDS.INVITE.name.toLowerCase():
      return handleInviteCommand({ applicationId });

    default:
      return createUnknownCommandResponse();
  }
}

export async function handleAutocomplete(context: AutocompleteContext): Promise<DiscordResponse> {
  const { commandName, options, discordUserId } = context;

  switch (commandName.toLowerCase()) {
    case COMMANDS.DAILY.name.toLowerCase():
    case COMMANDS.DAILYJP.name.toLowerCase(): {
      const region = commandName.toLowerCase() === 'dailyjp' ? 'jp' : 'intl';
      const focused = options?.find(o => o.focused) ?? options?.find(o => o.name === 'date');
      const focusedValue = typeof focused?.value === 'string' ? focused.value : '';
      return handleDailyAutocomplete({ discordUserId, region, focusedValue });
    }
    default:
      return { type: 8, data: { choices: [] } };
  }
}

export async function handleComponents(context: ComponentContext): Promise<DiscordResponse | null> {
  const { customId, discordUserId, applicationId, interactionToken } = context;

  // Parse the custom_id: recents_<userId>_<region>_<skip>
  if (customId.startsWith('recents_')) {
    const parts = customId.split('_');
    if (parts.length === 4) {
      const buttonUserId = parts[1];
      const region = parts[2] as 'intl' | 'jp';
      const skip = parseInt(parts[3], 10);

      // verify the user clicking is the same as the user who initiated the command
      if (!discordUserId || discordUserId !== buttonUserId) {
        return null;
      }

      return handleRecentsCommand({
        discordUserId,
        region,
        applicationId,
        interactionToken,
        skip,
      });
    }
  }

  // Parse the custom_id: album_preference_<userId>_<region>_<choice>
  if (customId.startsWith('album_preference_')) {
    const parts = customId.split('_');
    if (parts.length === 5) {
      const buttonUserId = parts[2];
      const region = parts[3] as 'intl' | 'jp';
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
      });
    }
  }

  return null;
}
