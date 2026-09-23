import { fetch } from 'undici';
import { config } from 'dotenv';
import pino from 'pino';

const log = pino(pino.destination({ sync: true })).child({ context: 'register-discord-commands' });

config({ path: ".env.local" });

// Discord bot configuration
const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// Mirror of getEnabledRegions() from src/lib/enabled-regions.ts (this is a
// plain Node script and cannot import the TS module).
const REGION_LABELS = { intl: 'International', jp: 'Japan', cn: 'China' };

function getEnabledRegions() {
  const envValue = process.env.NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS ?? process.env.NEXT_PUBLIC_ENABLED_REGIONS;
  if (envValue === undefined) return ['intl', 'jp'];
  const regions = envValue
    .split(',')
    .map(r => r.trim())
    .filter(r => r === 'intl' || r === 'jp' || r === 'cn');
  return [...new Set(regions)];
}

const enabledRegions = getEnabledRegions();

// Shared optional `region` option. Defaults to the user's selected region.
const regionOption = {
  type: 3, // STRING
  name: 'region',
  description: 'Region to use. Defaults to your selected region.',
  required: false,
  choices: enabledRegions.map(r => ({ name: REGION_LABELS[r] ?? r, value: r })),
};

// Shared optional `fetch` option. When true, force a refetch before running.
const fetchOption = {
  type: 5, // BOOLEAN
  name: 'fetch',
  description: 'Force a refetch from maimai DX NET before running this command.',
  required: false,
};

// Define the commands to register
const commands = [
  {
    name: 'invite',
    description: 'Get an invite link to add tomomai ともマイ bot to your server',
  },
  {
    name: 'profile',
    description: 'Show your latest maimai rating',
    options: [regionOption, fetchOption],
  },
  {
    name: 'fetch',
    description: 'Refetch and update your latest maimai scores',
    options: [regionOption],
  },
  {
    name: 'recents',
    description: 'Show your most recent play',
    options: [regionOption, fetchOption],
  },
  {
    name: 'recommend',
    description: 'Show song recommendations to improve your rating',
    options: [regionOption, fetchOption],
  },
  {
    name: 'daily',
    description: 'Show your plays from a single JST day',
    options: [
      regionOption,
      fetchOption,
      {
        type: 3,
        name: 'date',
        description: 'JST day (YYYY-MM-DD). Defaults to the day of your most recent play.',
        required: false,
        autocomplete: true,
      },
    ],
  },
];

async function registerCommands() {
  if (!APPLICATION_ID || !BOT_TOKEN) {
    log.error('❌ Missing Discord environment variables');
    log.error('Please set NEXT_PUBLIC_DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN in your .env file');
    process.exit(1);
  }

  try {
    if (enabledRegions.length === 0) throw new Error('No maimai regions are enabled');
    log.info({ regions: enabledRegions }, 'Region choices');
    log.info('🔄 Registering Discord slash commands...');

    const response = await fetch(
      `https://discord.com/api/v10/applications/${APPLICATION_ID}/commands`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${BOT_TOKEN}`,
        },
        body: JSON.stringify(commands.map(command => ({
          ...command,
          integration_types: [0, 1],
          contexts: [0, 1, 2],
        }))),
      }
    );

    if (response.ok) {
      const data = await response.json();
      log.info('✅ Successfully registered commands:');
      data.forEach(command => {
        log.info(`   • /${command.name} - ${command.description}`);
      });
    } else {
      const errorText = await response.text();
      log.error({ status: response.status, err: new Error(errorText) }, 'Error registering commands');
      process.exit(1);
    }
  } catch (error) {
    log.error({ err: error }, 'Failed to register commands');
    process.exit(1);
  }
}

registerCommands();
