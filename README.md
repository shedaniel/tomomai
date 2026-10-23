# tomomai ともマイ

A modern web application for tracking and analyzing your maimai DX scores with friends. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Local Development

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io)
- Docker (runs Postgres, Redis and a local S3 bucket via `docker-compose.yml`)
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), only for testing the Discord bot (`brew install cloudflared`)

### Setup

```bash
git clone https://github.com/shedaniel/tomomai.git
cd tomomai
pnpm install
make setup
pnpm dev
```

`make setup` writes `.env.local` files with generated secrets (it never overwrites existing ones), starts the
containers, applies migrations and seeds the song catalogue from tomomai.lol. Optional integrations are listed
commented out in `.env.local`, see [SETUP.md](SETUP.md) for what each one does.

Visit [http://localhost:3000](http://localhost:3000). Without OAuth credentials you can sign in with the
dev-only anonymous account.

Other apps run alongside it:

```bash
pnpm render:dev   # image render service on :8080 (profile images, Discord images)
pnpm guess:dev    # guess game on :3001
```

### Make targets

```bash
make setup             # env + up + migrate + seed
make env               # create missing .env.local files
make up / make down    # start / stop the containers
make migrate           # apply migrations to the local databases
make seed              # import the song catalogue
make reset             # wipe the containers' volumes and rebuild from scratch
make discord-tunnel    # public URL for testing the Discord bot locally
make discord-register  # register slash commands
```

### Other scripts

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm db:generate       # generate a migration after editing the schema
pnpm db:studio         # Drizzle Studio
```

## Discord Setup

### Discord OAuth (for user authentication)

1. **Create Discord Application**
   - Visit [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application" and name it
   - Navigate to "OAuth2" section

2. **Configure OAuth2**
   - Add redirect URI: `http://localhost:3000/api/auth/callback/discord`
   - For production: `https://yourdomain.com/api/auth/callback/discord`
   - Copy Client ID and Client Secret to your `.env.local`

### Discord Bot (for bot functionality)

1. **Enable Bot**
   - In your Discord Application, navigate to "Bot" section
   - Click "Add Bot" to create a bot user
   - Copy the Bot Token to your `.env.local` as `DISCORD_BOT_TOKEN`

2. **Get Application Credentials**
   - Go to "General Information" section
   - Copy "Application ID" to your `.env.local` as `NEXT_PUBLIC_DISCORD_APPLICATION_ID`
   - Copy "Public Key" to your `.env.local` as `DISCORD_PUBLIC_KEY`

3. **Set Interactions Endpoint URL**
   - In "General Information", scroll to "Interactions Endpoint URL"
   - Set it to: `https://yourdomain.com/api/interactions`
   - This tells Discord where to send slash command interactions
   - Locally, run `pnpm dev` and `make discord-tunnel`. With `DISCORD_BOT_TOKEN` set it updates the endpoint for
     you, otherwise paste the printed URL. The URL changes on every run, so use a separate Discord application for
     development. An endpoint that is not a quick-tunnel URL is only replaced with `make discord-tunnel FORCE=1`. Restart `pnpm dev` after editing `.env.local`.
   - Commands that need an account expect your Discord account to be linked, so also set
     `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` locally. Image commands need `pnpm render:dev`.

4. **Register Bot Commands**
   ```bash
   make discord-register
   ```

5. **Invite Bot to Server**
   - Use `/invite` slash command to get an invite link
   - Or manually create: `https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=applications.commands`

## Deployment

### Vercel (Recommended)

1. Import your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard (see [SETUP.md](SETUP.md))
3. Run `pnpm run db:migrate` to set up your production database

## License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **SEGA** for creating maimai DX
- **[dxrating](https://github.com/gekichumai/dxrating)** for providing internal level data
- **[otoge-db](https://github.com/zvuc/otoge-db)** for providing level data
