## Commits & PRs
Before writing a commit message or opening a pull request, read
docs/COMMIT_CONVENTION.md and follow the `type(scope): summary` format.

## Logging
Before adding or changing any logging, read docs/LOGGING.md and follow the musts
it lays out (structured logger over console, the `err` field for errors,
per-request logger and requestId, flushing in serverless handlers).

## Database Migrations
Never run `db:push`, `db:migrate`, `drizzle-kit push`, `drizzle-kit migrate`, or
equivalent schema-application commands in this repository. The only permitted
Drizzle schema command is `db:generate`/`drizzle-kit generate`.

Before generating a migration, notify the user that generation is about to
reset migration state. Then restore the tracked contents of
`apps/main/drizzle-pg` from `upstream/main` and remove only untracked files
inside that exact directory so the journal, snapshots, and SQL migrations match
`upstream/main`. Never reset `schema-pg.ts` or unrelated files. Confirm the
reset result to the user before running generation. Production receives one
new generated migration version for the multi-game backend change.

Direct edits to migration `.sql` files introduced on the current branch
(relative to `upstream/main`) are allowed for custom logic that Drizzle Kit
cannot generate, such as data backfills, identity matching, and validation.
These SQL-only edits do not require regeneration or the migration-state reset
above. Do not rewrite migrations already present on `upstream/main`. The ban
on applying migrations still applies.

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
