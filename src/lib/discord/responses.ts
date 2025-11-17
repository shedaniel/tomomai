import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
  };
  timestamp?: string;
  image?: {
    url: string;
    proxy_url?: string;
    height?: number;
    width?: number;
  };
  thumbnail?: {
    url: string;
    proxy_url?: string;
    height?: number;
    width?: number;
  };
}

export interface DiscordResponse {
  type: InteractionResponseType;
  data?: {
    content?: string;
    embeds?: DiscordEmbed[];
    flags?: InteractionResponseFlags;
    components?: any[];
  };
}

// Discord color constants
export const DISCORD_COLORS = {
  RED: 0xED4245,
  GREEN: 0x57F287,
  YELLOW: 0xFEE75C,
  BLURPLE: 0x5865F2,
} as const;

// Helper function to get user-friendly labels for fetch states
export function getStateFriendlyName(state: string): string {
  const FETCH_STATES = {
    LOGIN: 'login',
    PLAYER_DATA: 'player_data',
    SONG_DATA_EASY: 'song_data_easy',
    SONG_DATA_ADVANCED: 'song_data_advanced',
    SONG_DATA_EXPERT: 'song_data_expert',
    SONG_DATA_MASTER: 'song_data_master',
    SONG_DATA_REMASTER: 'song_data_remaster',
  };

  switch (state) {
    case FETCH_STATES.LOGIN:
      return 'Logging in to maimai DX NET';
    case FETCH_STATES.PLAYER_DATA:
      return 'Fetching player profile';
    case FETCH_STATES.SONG_DATA_EASY:
      return 'Loading Easy scores';
    case FETCH_STATES.SONG_DATA_ADVANCED:
      return 'Loading Advanced scores';
    case FETCH_STATES.SONG_DATA_EXPERT:
      return 'Loading Expert scores';
    case FETCH_STATES.SONG_DATA_MASTER:
      return 'Loading Master scores';
    case FETCH_STATES.SONG_DATA_REMASTER:
      return 'Loading Re:MASTER scores';
    default:
      return state;
  }
}

// Helper function to get playful rating comments
export function getRatingComment(rating: number): string {
  if (rating >= 15000) return "not terrible I guess";
  else if (rating >= 14000) return "getting there, but you can do better";
  else if (rating >= 13000) return "decent effort, at least you're trying";
  else if (rating >= 12000) return "respectable, git good";
  else if (rating >= 11000) return "pretty good, for now";
  else if (rating >= 10000) return "impressive, as a beginner";
  else return "you REALLY suck";
}

// Standard response templates
export function createNotRegisteredResponse(): DiscordResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [{
        title: '❌ Not Registered',
        description: `You haven't linked your Discord account to tomomai yet!`,
        color: DISCORD_COLORS.RED,
        fields: [{
          name: '🔗 Get Started',
          value: '[Visit tomomai ともマイ](https://tomomai.lol/) to sign in with Discord and start tracking your scores!',
          inline: false,
        }],
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
        },
      }],
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  };
}

export function createNoDataResponse(regionName: string): DiscordResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [{
        title: '📊 No Data Found',
        description: `You don't have any ${regionName} region data yet!`,
        color: DISCORD_COLORS.YELLOW,
        fields: [{
          name: '🎯 Import Your Scores',
          value: `[Visit tomomai ともマイ](https://tomomai.lol/) to import your ${regionName} maimai DX scores!`,
          inline: false,
        }],
        footer: {
          text: 'tomomai ともマイ • maimai DX score tracker',
        },
      }],
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  };
}

export function createErrorResponse(message: string): DiscordResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: message,
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  };
}

export function createDeferredResponse(): DiscordResponse {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
  };
}

export function createPongResponse(): DiscordResponse {
  return {
    type: InteractionResponseType.PONG,
  };
}

export function createUnknownCommandResponse(): DiscordResponse {
  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: 'Unknown command',
      flags: InteractionResponseFlags.EPHEMERAL,
    },
  };
}

// Helper function to edit Discord messages
export async function editDiscordMessage(
  applicationId: string,
  interactionToken: string,
  content: any
): Promise<void> {
  await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(content),
    }
  );
}

// Helper function to edit Discord message with image attachment
export async function editDiscordMessageWithImage(
  applicationId: string,
  interactionToken: string,
  embedData: any,
  imageBuffer: Buffer,
  components?: any[]
): Promise<void> {
  const formData = new FormData();
  
  // Add the image file
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'image/png' });
  formData.append('files[0]', blob, 'maimai-profile.png');
  
  // Add the payload without embedding the image
  const payload: any = {
    embeds: [embedData]
  };
  
  if (components) {
    payload.components = components;
  }
  
  formData.append('payload_json', JSON.stringify(payload));

  await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: 'PATCH',
      body: formData,
    }
  );
}
