import { InteractionResponseType } from 'discord-interactions';
import { DISCORD_COLORS, DiscordResponse } from '../responses';

export interface InviteCommandOptions {
  applicationId: string;
}

export async function handleInviteCommand({
  applicationId
}: InviteCommandOptions): Promise<DiscordResponse> {
  const botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: '🎯 Invite tomomai ともマイ',
          description: 'Add tomomai ともマイ bot to your Discord server to track and share maimai DX scores!',
          color: DISCORD_COLORS.BLURPLE,
          fields: [
            {
              name: '✨ Features',
              value: '• Track scores across International and Japan regions\n• Import data directly from maimai DX NET\n• View historical progress with snapshots\n• Beautiful score analysis and rating calculations',
              inline: false,
            },
            {
              name: '🔗 Add to Server',
              value: `[Click here to invite the bot](${botInviteUrl})`,
              inline: false,
            },
            {
              name: '🌐 Website',
              value: 'https://tomomai.lol/',
              inline: false,
            }
          ],
          footer: {
            text: 'tomomai ともマイ • maimai DX score tracker',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}
