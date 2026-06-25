## Commits & PRs
Before writing a commit message or opening a pull request, read
docs/COMMIT_CONVENTION.md and follow the `type(scope): summary` format.

## Logging
Before adding or changing any logging, read docs/LOGGING.md and follow the musts
it lays out (structured logger over console, the `err` field for errors,
per-request logger and requestId, flushing in serverless handlers).

## Discord Commands
Discord commands are handled with src/app/api/interactions, and they are registered with scripts/register-discord-commands.js.
Documentation: <https://discord.com/developers/docs/interactions/receiving-and-responding>

## Comments
Write comments sparingly. Only comment the *why* when it is non-obvious —
never the *what*. Do not restate what the code already says (e.g. don't put
`// enable caching` above `export const revalidate = 300`). Do not narrate
your thought process or deliberation in comments; state the reason directly
in one short line if needed, or omit it entirely. Too many comments is worse
than too few.
