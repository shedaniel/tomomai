import { NextRequest } from 'next/server';
import { 
  InteractionType, 
  verifyKey,
  InteractionResponseType,
} from 'discord-interactions';
import { handleCommand, handleComponents, createPongResponse } from '@/lib/discord';

// Discord bot configuration
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY!;
const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID!;

export async function POST(request: NextRequest) {
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

    console.log(interaction);

    // Handle PING interactions (Discord verification)
    if (interaction.type === InteractionType.PING) {
      return Response.json(createPongResponse());
    }

    // Handle application commands (slash commands)
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      const { data, member } = interaction;
      const discordUserId = member?.user?.id;

      const response = await handleCommand({
        commandName: data.name,
        discordUserId,
        applicationId: APPLICATION_ID,
        interactionToken: interaction.token,
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
        return new Response('Unknown component interaction', { status: 400 });
      }

      // Return deferred update response
      return Response.json({
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: response.data,
      });
    }

    return new Response('Unknown interaction type', { status: 400 });
  } catch (error) {
    console.error('Error handling Discord interaction:', error);
    return new Response('Internal server error', { status: 500 });
  }
} 