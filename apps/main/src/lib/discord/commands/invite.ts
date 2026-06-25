import { InteractionResponseType } from 'discord-interactions';
import { DISCORD_COLORS, DiscordResponse } from '../responses';
import { resolveBaseUrl } from '../../base-url';
import { t } from '../i18n';

export interface InviteCommandOptions {
  applicationId: string;
  locale?: string;
}

export async function handleInviteCommand({
  applicationId,
  locale,
}: InviteCommandOptions): Promise<DiscordResponse> {
  const botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=applications.commands`;

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      embeds: [
        {
          title: t(locale, 'invite.title'),
          description: t(locale, 'invite.description'),
          color: DISCORD_COLORS.BLURPLE,
          fields: [
            {
              name: t(locale, 'invite.featuresName'),
              value: t(locale, 'invite.featuresValue'),
              inline: false,
            },
            {
              name: t(locale, 'invite.addName'),
              value: t(locale, 'invite.addValue', { url: botInviteUrl }),
              inline: false,
            },
            {
              name: t(locale, 'invite.websiteName'),
              value: `${resolveBaseUrl()}/`,
              inline: false,
            }
          ],
          footer: {
            text: t(locale, 'common.footer'),
          },
          timestamp: new Date().toISOString(),
        },
      ],
    },
  };
}
