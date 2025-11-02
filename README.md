# tomomai ともマイ

A modern web application for tracking and analyzing your maimai DX scores with friends. Built with Next.js 15, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Discord Application (for OAuth)
- Turso Database (recommended) or local SQLite

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/shedaniel/maimai-friends.git
   cd maimai-friends
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```

   Configure your `.env.local` file:
   ```env
   BETTER_AUTH_SECRET=your-secure-random-secret-key
   NEXT_PUBLIC_DISCORD_APPLICATION_ID=your-discord-client-id
   DISCORD_CLIENT_SECRET=your-discord-client-secret
   TURSO_DATABASE_URL=libsql://your-database-url.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   
   # Generate using: node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
   FLAGS_SECRET=your-flags-secret
   
   # Generate using: openssl rand -hex 32
   MAIMAI_TOTP_SECRET=your-totp-secret
   
   # Optional: Admin functionality for song database updates
   ADMIN_UPDATE_TOKEN=your-secure-admin-token
   
   # Optional: Webhook URL for announcing song updates to Discord
   DISCORD_UPDATE_WEBHOOK=your-discord-webhook-url
   
   # Discord Bot (required for Discord bot functionality)
   NEXT_PUBLIC_DISCORD_APPLICATION_ID=your-discord-application-id
   DISCORD_BOT_TOKEN=your-discord-bot-token
   DISCORD_PUBLIC_KEY=your-discord-public-key
   ```

4. **Set up database**
   ```bash
   npm run db:migrate
   ```

   **Note**: If you're upgrading from a previous version, you'll need to run database migrations:
   ```bash
   npm run db:migrate      # Apply any pending migrations
   ```

5. **Register Discord bot commands (optional)**
   ```bash
   npm run discord:register
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

Visit [http://localhost:3000](http://localhost:3000) to see your application running!

## 🎯 Usage

### Admin Functionality (Optional)
Set your user role in the database to `admin`, and you will be able to see an admin panel on the top right submenu. Enter the admin token set in the env var.

## 🗄 Database Schema

The application uses a robust database schema with the following key tables:

- **`users`**: Discord user profiles and authentication
- **`user_tokens`**: Encrypted maimai authentication tokens per region
- **`user_snapshots`**: Player data snapshots with ratings and stats
- **`songs`**: Complete maimai song database with all difficulties and versions
- **`user_scores`**: Individual song scores linked to snapshots
- **`fetch_sessions`**: Track data fetching progress and status

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Start development server with Turbopack
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Run ESLint

# Database
npm run db:generate     # Generate migration files
npm run db:push         # Push schema changes to database
npm run db:migrate      # Run migrations
npm run db:studio       # Open Drizzle Studio (database browser)
```

## 🌐 Discord Setup

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
   npm run discord:register
   ```

5. **Invite Bot to Server**
   - Use `/invite` slash command to get an invite link
   - Or manually create: `https://discord.com/oauth2/authorize?client_id=YOUR_APPLICATION_ID&scope=applications.commands`

---

## 🏗 Database Setup

1. **Install Turso CLI**
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   ```

2. **Create Database**
   ```bash
   turso db create maimai-friends-[your-username]
   turso db show maimai-friends-[your-username] --url
   turso db tokens create maimai-friends-[your-username]
   ```

3. **Update Environment**
   ```env
   TURSO_DATABASE_URL=libsql://your-database-url.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   ```


## 🚀 Deployment

### Vercel (Recommended)

1. **Connect Repository**
   - Import your GitHub repository to Vercel
   - Set environment variables in Vercel dashboard

 2. **Environment Variables**
    ```env
    BETTER_AUTH_SECRET=your-production-secret
    DISCORD_CLIENT_ID=your-discord-client-id
    DISCORD_CLIENT_SECRET=your-discord-client-secret
    TURSO_DATABASE_URL=your-production-database-url
    TURSO_AUTH_TOKEN=your-production-auth-token
    
    # Generate using: node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
    FLAGS_SECRET=your-flags-secret
    
    # Generate using: openssl rand -hex 32
    MAIMAI_TOTP_SECRET=your-totp-secret
    
    # Optional: Admin functionality for song database updates
    ADMIN_UPDATE_TOKEN=your-production-admin-token
    
    # Optional: Webhook URL for announcing song updates to Discord
    DISCORD_UPDATE_WEBHOOK=your-discord-webhook-url
    ```

3. **Database Migrations**
   - Run `npm run db:migrate` to set up your production database

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **SEGA** for creating maimai DX
- **[dxrating](https://github.com/gekichumai/dxrating)** for providing internal level data
- **[otoge-db](https://github.com/zvuc/otoge-db)** for providing level data

## 🚧 Contributing & Support

**Note**: We are not currently accepting contributions until the project reaches proper deployment status. Please check back later for contribution guidelines.

For now, this project is in active development and we appreciate your interest, but ask that you wait until we have a stable foundation before submitting pull requests.

---

Built with ❤️ for the maimai community
