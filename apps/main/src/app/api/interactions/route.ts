import { NextRequest } from 'next/server';
import {
  InteractionType,
  verifyKey,
  InteractionResponseType,
} from 'discord-interactions';
import { handleCommand, handleComponents, handleAutocomplete, createPongResponse } from '@/lib/discord';
import { flushLogger } from '@/lib/logger';
import { requestLogger } from '@/lib/request-logger';

// Discord bot configuration
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID!;

export async function POST(request: NextRequest) {
  const { log, requestId } = requestLogger(request, "discord/interactions");
  try {
    // Get the raw body for signature verification
    const bytes = await request.bytes();
    const signature = request.headers.get('X-Signature-Ed25519');
    const timestamp = request.headers.get('X-Signature-Timestamp');

    // Verify the request is from Discord
    if (!signature || !timestamp) {
      return new Response('Missing signature headers', { status: 401 });
    }

    const isValidRequest = await verifyKey(bytes, signature, timestamp, DISCORD_PUBLIC_KEY);
    if (!isValidRequest) {
      return new Response('Invalid request signature', { status: 401 });
    }

    // Parse the interaction
    const interaction = JSON.parse(new TextDecoder().decode(bytes));

    log.debug({ interactionType: interaction.type }, "Discord interaction received");

    // Handle PING interactions (Discord verification)
    if (interaction.type === InteractionType.PING) {
      return Response.json(createPongResponse());
    }

    // Handle application commands (slash commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { data, member, user } = interaction;
      const discordUserId = member?.user?.id ?? user?.id;

      const response = await handleCommand({
        commandName: data.name,
        options: data.options,
        discordUserId,
        applicationId: APPLICATION_ID,
        interactionToken: interaction.token,
      });

      return Response.json(response);
    }

    // Handle autocomplete (slash command option suggestions)
    if (interaction.type === InteractionType.APPLICATION_COMMAND_AUTOCOMPLETE) {
      const { data, member, user } = interaction;
      const discordUserId = member?.user?.id ?? user?.id;

      const response = await handleAutocomplete({
        commandName: data.name,
        options: data.options,
        discordUserId,
      });

      return Response.json(response);
    }

    // Handle message component interactions (buttons)
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      const { data, member } = interaction;
      const discordUserId = member?.user?.id;

      const response = await handleComponents({
        customId: data.custom_id,
        discordUserId,
        applicationId: APPLICATION_ID,
        interactionToken: interaction.token,
      });

      if (!response) {
        // Either unknown component or unauthorized user
        return Response.json({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '❌ This button is not available to you.',
            flags: 64, // EPHEMERAL
          },
        });
      }

      // Return update message response
      return Response.json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: response.data,
      });
    }

    return new Response('Unknown interaction type', { status: 400 });
  } catch (error) {
    log.error({ err: error }, "Error handling Discord interaction");
    // Flush only on the error path — Discord requires a fast ack on success.
    await flushLogger();
    return new Response(`Internal server error (${requestId})`, { status: 500 });
  }
}
