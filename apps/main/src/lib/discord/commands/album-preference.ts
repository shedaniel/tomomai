import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { and, eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import { DiscordResponse, editDiscordMessage, DISCORD_COLORS, createDeferredResponse } from '../responses';
import { handleFetchCommand } from './fetch';

export interface AlbumPreferenceOptions {
  discordUserId: string;
  region: 'intl' | 'jp';
  fetchUseAlbums: boolean;
  applicationId: string;
  interactionToken: string;
}

export async function handleAlbumPreferenceSelection({
  discordUserId,
  region,
  fetchUseAlbums,
  applicationId,
  interactionToken,
}: AlbumPreferenceOptions): Promise<DiscordResponse> {
  // Return deferred response immediately
  const deferredResponse = createDeferredResponse();

  // Do the heavy work in the background
  const backgroundTask = (async () => {
    try {
      // Get the user by Discord ID
      const [dbUser] = await db
        .select({ id: user.id })
        .from(user)
        .innerJoin(account, eq(account.userId, user.id))
        .where(
          and(
            eq(account.accountId, discordUserId),
            eq(account.providerId, 'discord')
          )
        )
        .limit(1);

      if (!dbUser) {
        await editDiscordMessage(applicationId, interactionToken, {
          embeds: [{
            title: '❌ Error',
            description: 'Unable to find your account. Please try again.',
            color: DISCORD_COLORS.RED,
            footer: {
              text: 'tomomai ともマイ • maimai DX score tracker',
            },
            timestamp: new Date().toISOString(),
          }],
        });
        return;
      }

      // Update the user's album preference
      await db
        .update(user)
        .set({
          fetchUseAlbums: fetchUseAlbums,
          updatedAt: new Date(),
        })
        .where(eq(user.id, dbUser.id));

      // Show confirmation message
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '✅ Preference Set',
          description: `Your album preference has been set to "${fetchUseAlbums ? 'Save Albums' : 'Don\'t Save Albums'}". Starting fetch...`,
          color: DISCORD_COLORS.GREEN,
          footer: {
            text: 'tomomai ともマイ • maimai DX score tracker',
          },
          timestamp: new Date().toISOString(),
        }],
        components: [],
      });

      // Wait a bit before starting the fetch
      await new Promise(resolve => setTimeout(resolve, 500));

      // Trigger the fetch
      await handleFetchCommand({
        discordUserId,
        region,
        applicationId,
        interactionToken,
      });
    } catch (error) {
      getLogger().error({ err: error }, 'Error handling album preference');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: '❌ Error',
          description: 'An error occurred while setting your preference. Please try again.',
          color: DISCORD_COLORS.RED,
          footer: {
            text: 'tomomai ともマイ • maimai DX score tracker',
          },
          timestamp: new Date().toISOString(),
        }],
      });
    }
  })();

  // Use waitUntil to ensure the background task continues
  waitUntil(backgroundTask);

  return deferredResponse;
}
