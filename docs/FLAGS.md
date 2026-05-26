# How to add a feature flag

All feature flags live in `apps/main/src/lib/flags.ts` and are powered by `flags/next` (Vercel's Flags SDK). Each flag uses an `identify(context)` step that loads the current session and per-user overrides from the DB, then a `decide(context)` step that returns the final value. Flags are exposed via the discovery endpoint at `apps/main/src/app/.well-known/vercel/flags/route.ts`.

## Steps

To add a new flag, touch three spots in `apps/main/src/lib/flags.ts`:

1. Add the key to the `Flags` interface.
2. Add an entry to `registry` (`defaultValue`, `userSelectable`, `decide(ctx)`).
3. Export a named `use<Name>` alias from `registry.<name>.fn`.

`flagDefinitions`, `defaultFlags`, and `useFlags` are all derived from `registry` automatically — no manual sync needed.

## Field reference

| Field | Meaning |
| --- | --- |
| `defaultValue` | Value returned when `decide()` is unreachable or throws. |
| `userSelectable` | If `true`, the flag can be overridden by the logged-in user via the experiments dialog (stored in `user.flagOverrides`). Non-user-selectable flags ignore overrides. |
| `decide(ctx)` | Function evaluated server-side per request. Receives `{ userId, role, overrides }`. Use this to gate on time, env, user identity, role, etc. Overrides are applied before `decide` runs, so `decide` only sees the "no override" case. |

## Worked example: `aprilFools2026`

Goal: a flag that turns on April Fools 2026 behaviour, mirroring `isAprilFools2026JST()` from `apps/main/src/lib/april-fools.ts`.

```ts
// 1. Flags interface
export interface Flags {
  // ...
  aprilFools2026: boolean;
}

// 2. registry entry
aprilFools2026: defineFlag("aprilFools2026", {
  defaultValue: false,
  userSelectable: true,
  decide: () => isAprilFools2026JST(),
}),

// 3. Named export (required for Vercel Flags SDK discovery)
export const useAprilFools2026 = registry.aprilFools2026.fn;
```

`decide` may use the context, e.g. to gate on role:

```ts
adminPanel: defineFlag("adminPanel", {
  defaultValue: false,
  userSelectable: false,
  decide: ctx => ctx.role === "admin",
}),
```

## Reading flags at runtime

- In a server component / route: `const flags = await useFlags();`. Identifies the user once per request (deduped) and applies overrides inside each `decide()`.
- To read a single flag: `await useAprilFools2026()`.

## User overrides

Logged-in users can override `userSelectable` flags via the experiments dialog (`apps/main/src/components/experiments-dialog.tsx`). Overrides are stored in the `user.flagOverrides` JSONB column and applied inside each flag's `decide` step. Anonymous users always receive the `decide()` result; there is no client-side override path.

To manage overrides programmatically, use the tRPC endpoints in `apps/main/src/server/routers/user/flags.ts`:

- `user.getUserSelectableFlags` (public) → `{ flags, currentOverrides, authenticated }`
- `user.setFlagOverrides` (protected) → replaces the caller's `flagOverrides` row
