# tomomai ともマイ

A modern web application for tracking and analyzing your maimai DX scores with friends. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Redis
- Discord Application (for OAuth)
- Cloudflare R2 bucket (for image storage)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/shedaniel/tomomai.git
   cd tomomai
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   See [SETUP.md](SETUP.md) for the full list of environment variables.

4. **Set up database**
   ```bash
   pnpm run db:migrate
   ```

5. **Register Discord bot commands (optional)**
   ```bash
   pnpm run discord:register
   ```

6. **Start development server**
   ```bash
   pnpm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see your application running!

## Usage

## Development

### Available Scripts

```bash
# Development
pnpm run dev              # Start development server with Turbopack
pnpm run build            # Build for production
pnpm run start            # Start production server
pnpm run lint             # Run ESLint

# Database
pnpm run db:generate      # Generate migration files
pnpm run db:push          # Push schema changes to database
pnpm run db:migrate       # Run migrations
pnpm run db:studio        # Open Drizzle Studio (database browser)
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

3. **Set Interactions Endpoint URL (for production)**
   - In "General Information", scroll to "Interactions Endpoint URL"
   - Set it to: `https://yourdomain.com/api/interactions`
   - This tells Discord where to send slash command interactions

4. **Register Bot Commands**
   ```bash
   pnpm run discord:register
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
