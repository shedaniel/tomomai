import { InteractionResponseType, InteractionResponseFlags } from 'discord-interactions';
import { FETCH_STATUS_ENUM } from '../db/types';
import { FETCH_STATES } from '../fetch-states';
import { resolveBaseUrl } from "@tomomai/server/base-url";

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
    choices?: { name: string; value: string }[];
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
    case FETCH_STATES.SONG_DATA_UTAGE:
      return 'Loading Utage scores';
    case FETCH_STATES.ALBUM_DATA:
      return 'Loading album data';
    case FETCH_STATES.HIDDEN_SONGS:
      return 'Loading hidden songs';
    case FETCH_STATES.RECENT_SONGS:
      return 'Loading recent plays';
    default:
      return state;
  }
}

// Rating comments by tier — each returns a short phrase that fits:
// "<@user> {comment}, you only have **{rating}** rating! 😤"
const RATING_COMMENTS: { min: number; max: number; comments: string[] }[] = [
  { min: 0, max: 10000, comments: [
    "you REALLY suck",
    "did you just install the game",
    "the tutorial called, it wants you back",
    "I've seen higher numbers on a dice roll",
    "at least you found the arcade",
  ]},
  { min: 10000, max: 12000, comments: [
    "impressive, as a beginner",
    "the buttons aren't decorations, you know",
    "the washing machine plays better",
    "you're getting there... slowly",
    "the tutorial is over, right",
  ]},
  { min: 12000, max: 13000, comments: [
    "respectable, git good",
    "a few months in and still struggling",
    "most people discover the other buttons by now",
    "at least you're consistent... consistently mid",
    "the charts have yet to notice you",
  ]},
  { min: 13000, max: 14000, comments: [
    "decent effort, at least you're trying",
    "congrats on discovering master charts, sorry about the master charts",
    "you graduated from expert to master, the scores say you should've been held back",
    "getting into masters I see, my condolences",
    "some people reach this in their first month btw",
  ]},
  { min: 14000, max: 14500, comments: [
    "getting there, but you can do better",
    "the songs are getting harder and your scores are getting... creative",
    "you've reached the part where talent matters, how's that going",
    "the hard part starts now, good luck with that",
    "the gap between your confidence and your scores is showing",
  ]},
  { min: 14500, max: 15000, comments: [
    "welcome to the real maimai",
    "you've been grinding for this? genuinely asking",
    "on a scale from 1 to good, you showed up",
    "so close to not being a beginner anymore",
    "the real game starts now, your scores suggest you're not ready",
  ]},
  { min: 15000, max: 15500, comments: [
    "not terrible I guess",
    "congrats on exiting the beginner zone, welcome to mid",
    "you're no longer a beginner, now you're just regular bad",
    "you left beginners behind, your scores didn't get the memo",
    "finally past the tutorial, only took you this long",
  ]},
  { min: 15500, max: 16000, comments: [
    "not bad, not good, room temperature water energy",
    "starting to look competent, emphasis on 'starting' and 'look'",
    "you're approaching decent, approaching being the key word",
    "mid-tier and proud? actually don't answer that",
    "technically above average, in the way that C+ is above failing",
  ]},
  { min: 16000, max: Infinity, comments: [
    "actually decent, which somehow makes the remaining flaws funnier",
    "all that effort and you're still not the best in your local arcade",
    "high enough to know exactly how bad your remaining scores are",
    "impressive, now explain why you still can't AP a 13+",
    "not bad, but I've seen better from someone with half your play count",
  ]},
];

// Helper function to get playful rating comments
export function getRatingComment(rating: number): string {
  const tier = RATING_COMMENTS.find(t => rating >= t.min && rating < t.max) ?? RATING_COMMENTS[0];
  return tier.comments[Math.floor(Math.random() * tier.comments.length)];
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
          value: `[Visit tomomai ともマイ](${resolveBaseUrl()}/) to sign in with Discord and start tracking your scores!`,
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
          value: `[Visit tomomai ともマイ](${resolveBaseUrl()}/) to import your ${regionName} maimai DX scores!`,
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
