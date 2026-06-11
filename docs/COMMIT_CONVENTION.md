# Commit & PR title convention

We write commit subjects and PR titles in one consistent format so history and
the PR list stay scannable. PRs are squash-merged, so **a PR title becomes a
commit subject** — the same rules apply to both.

```
type(scope): short summary in the imperative
```

Example: `fix(main/percentile): bound matview read with statement_timeout`

---

## 1. Type

What kind of change it is. Pick the dominant one.

| Type       | Use for                                                            |
| ---------- | ----------------------------------------------------------------- |
| `feat`     | A new user-facing feature or capability                           |
| `fix`      | A bug fix                                                         |
| `refactor` | Restructuring that doesn't change behavior (renames, extraction)  |
| `perf`     | A change made primarily to improve performance                    |
| `docs`     | Documentation only                                               |
| `style`    | Formatting / visual-only with no logic change                     |
| `test`     | Adding or fixing tests only                                       |
| `build`    | Build system, dependencies, lockfile, bundler config             |
| `ci`       | CI/CD workflows and automation                                    |
| `chore`    | Maintenance that fits nothing above (config, housekeeping)        |

When a change is genuinely both (e.g. a bug fix that also adds infrastructure),
choose the type that matches the **primary motivation** and describe the rest in
the body.

## 2. Scope

Where the change lives. Scope is `app`, `package`, or `app/component` — narrow
enough to tell a reader which corner of the monorepo moved.

### Scope vocabulary

**Apps** (`apps/*`):

| Token   | Package         | What it is                          |
| ------- | --------------- | ----------------------------------- |
| `main`  | `@tomomai/site` | The main maimai-friends app         |
| `guess` | `@tomomai/guess`| The guessing / heardle minigames    |
| `data`  | —               | The catalog data service (self-host)|

**Packages** (`packages/*`) — use the bare package token when the change is
cross-project, since these are shared:

`ui`, `i18n`, `security`, `utils`, `catalog`, `server`, `userscript`

**`repo`** — for monorepo-wide infra that doesn't belong to one place: root
tooling, workspace config, top-level docs, CI shared across everything.

### Picking a scope

1. **One app, one area → `app/component`.** Name the submodule after the
   directory or feature it touches:
   `main/discord`, `main/auth`, `main/ui`, `main/db`, `main/logging`,
   `main/percentile`, `guess/ui`, `guess/audio`.

2. **A shared package → the bare package token.** A change to design tokens or
   components shared across apps is `ui`, not `main/ui`. A change only inside
   `apps/main`'s own components is `main/ui`.

   > Rule of thumb: if it lives in `packages/`, use the package token. If it
   > lives in `apps/<app>/`, use `<app>` or `<app>/<component>`.

3. **Sweeping, multi-scope change → the dominant scope.** A change that touches
   many places for one purpose takes the scope of its *theme*, not a list. The
   catalog-decouple PR touches `apps/data`, `apps/main`, `packages/catalog`,
   and `packages/server`, but its theme is the catalog, so:
   `refactor(catalog): decouple chart catalog from user data`. Reserve `repo`
   for changes with no single dominant theme.

## 3. Summary

The text after the colon.

- **Imperative mood**: "add", "fix", "bound" — not "added" / "adds" / "fixing".
  It should complete the sentence "This change will ___".
- **Lowercase first word**, no trailing period.
- **Keep it under ~70 characters.** If you can't, the change may be doing too
  much, or detail belongs in the body.
- Describe the *what/why*, not the file list. `fix(main/logging): flush logs
  before serverless freeze` beats `fix(main/logging): edit discord-webhooks.ts`.

## 4. Body (optional, for PRs and non-trivial commits)

Leave a blank line after the subject, then explain **why** and any context a
reviewer needs: the bug's symptom, trade-offs, follow-ups, breaking changes,
and operational steps (migrations to run, env vars to set, commands to
re-run). Wrap prose around 72 columns. Bullet lists are fine.

Call out breaking changes explicitly with a `BREAKING CHANGE:` line in the body
so they're easy to grep.

## Examples

```
feat(main/ui): MD3 tonal surfaces, glass overlays, and pill controls
fix(main/percentile): bound matview read with statement_timeout
refactor(main/discord): unify region command pairs and simplify /fetch
fix(main/logging): reliable Discord webhooks and structured-logging overhaul
feat(main/legal): add versioned ToS and Privacy Policy with consent flow
refactor(catalog): decouple chart catalog from user data for self-hosting
fix(guess): play heardle audio in iOS silent mode via playback session
feat(ui): add tabular-numeric Inter stylistic set
docs(repo): document the commit and PR title convention
build(repo): bump Next.js to 16.2
```

## Quick checklist

- [ ] `type` is the primary kind of change
- [ ] `scope` points at one app/component, one package, or `repo`
- [ ] summary is imperative, lowercase, no period, ≤ ~70 chars
- [ ] anything operational (migrations, env, re-registration) is in the body
- [ ] breaking changes flagged with `BREAKING CHANGE:`
