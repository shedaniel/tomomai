import { handleFetchCommand } from './commands/fetch';
import { handleInviteCommand } from './commands/invite';
import { handleProfileCommand } from './commands/profile';
import { handleRecentsCommand } from './commands/recents';
import { handleAlbumPreferenceSelection } from './commands/album-preference';
import { createUnknownCommandResponse, DiscordResponse } from './responses';

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
} as const;

export interface CommandContext {
  commandName: string;
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

export async function handleCommand(context: CommandContext): Promise<DiscordResponse> {
  const { commandName, discordUserId, applicationId, interactionToken } = context;

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

    case COMMANDS.INVITE.name.toLowerCase():
      return handleInviteCommand({ applicationId });

    default:
      return createUnknownCommandResponse();
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
