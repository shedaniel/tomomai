import { db } from '@/lib/db';
import { account, user } from '@/lib/db/schema-pg';
import { getLogger } from '@/lib/request-logger';
import { and, eq } from 'drizzle-orm';
import { waitUntil } from '@vercel/functions';
import { DiscordResponse, editDiscordMessage, DISCORD_COLORS, createDeferredResponse } from '../responses';
import { t } from '../i18n';
import { handleFetchCommand } from './fetch';
import type { Region } from '@/lib/types';

export interface AlbumPreferenceOptions {
  discordUserId: string;
  region: Region;
  fetchUseAlbums: boolean;
  applicationId: string;
  interactionToken: string;
  locale?: string;
}

export async function handleAlbumPreferenceSelection({
  discordUserId,
  region,
  fetchUseAlbums,
  applicationId,
  interactionToken,
  locale,
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
            title: t(locale, 'common.error.title' ),
            description: t(locale, 'common.error.generic'),
            color: DISCORD_COLORS.RED,
            footer: {
              text: t(locale, 'common.footer'),
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
          title: t(locale, 'fetch.albumPreference.preferenceSet.title'),
          description: t(locale, 'fetch.albumPreference.preferenceSet.description', {
            choice: t(locale, fetchUseAlbums ? 'fetch.albumPreference.preferenceSet.save' : 'fetch.albumPreference.preferenceSet.dontSave'),
          }),
          color: DISCORD_COLORS.GREEN,
          footer: {
            text: t(locale, 'common.footer'),
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
        regionParam: region,
        applicationId,
        interactionToken,
        locale,
      });
    } catch (error) {
      getLogger().error({ err: error }, 'Error handling album preference');
      await editDiscordMessage(applicationId, interactionToken, {
        embeds: [{
          title: t(locale, 'common.error.title'),
          description: t(locale, 'common.error.generic'),
          color: DISCORD_COLORS.RED,
          footer: {
            text: t(locale, 'common.footer'),
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
