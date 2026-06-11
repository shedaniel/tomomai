## Commits & PRs
Before writing a commit message or opening a pull request, read
docs/COMMIT_CONVENTION.md and follow the `type(scope): summary` format.

## Logging
Before adding or changing any logging, read docs/LOGGING.md and follow the musts
it lays out (structured logger over console, the `err` field for errors,
per-request logger and requestId, flushing in serverless handlers).

## Discord Commands
Discord commands are handled with src/app/api/interactions, and they are registered with scripts/register-discord-commands.js.
Documentation: https://discord.com/developers/docs/interactions/receiving-and-responding
