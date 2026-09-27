export const API_SCOPES = {
  ready: {
    name: "Ready",
    description: "Basic access. Included by default.",
    destructive: false,
    sensitive: false,
    default: true,
  },

  // ── User ──────────────────────────────────────────────────────────────────
  "user:metadata:read": {
    name: "User Metadata (Read)",
    description: "Read your username, region, profile visibility, and role.",
    destructive: false,
    sensitive: false,
    default: false,
  },

  // ── Snapshot: latest ──────────────────────────────────────────────────────
  "snapshot:latest:metadata:read": {
    name: "Latest Snapshot Metadata (Read)",
    description: "Read metadata (rating, display name, play counts, etc.) for your latest snapshot.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:latest:songs:b50:read": {
    name: "Latest Snapshot B50 Songs (Read)",
    description: "Read the B50 song scores (best 50) from your latest snapshot.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:latest:songs:read": {
    name: "Latest Snapshot All Songs (Read)",
    description: "Read all song scores from your latest snapshot.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:latest:events:read": {
    name: "Latest Snapshot Events (Read)",
    description: "Read event progress data from your latest snapshot.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:latest:icon:read": {
    name: "Latest Snapshot Icon (Read)",
    description: "Read your profile icon URL from your latest snapshot. This is sensitive as it may reveal your social identity.",
    destructive: false,
    sensitive: true,
    default: false,
  },

  // ── Snapshot: all ─────────────────────────────────────────────────────────
  "snapshot:all:metadata:read": {
    name: "All Snapshots Metadata (Read)",
    description: "List all your snapshots and read their metadata.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:all:songs:b50:read": {
    name: "All Snapshots B50 Songs (Read)",
    description: "Read the B50 song scores from any of your snapshots.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:all:songs:read": {
    name: "All Snapshots All Songs (Read)",
    description: "Read all song scores from any of your snapshots.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:all:events:read": {
    name: "All Snapshots Events (Read)",
    description: "Read event progress data from any of your snapshots.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:all:icon:read": {
    name: "All Snapshots Icon (Read)",
    description: "Read your profile icon URL from any snapshot. This is sensitive as it may reveal your social identity.",
    destructive: false,
    sensitive: true,
    default: false,
  },

  // ── Recents ───────────────────────────────────────────────────────────────
  "recent:read": {
    name: "Recent Plays (Read)",
    description: "Read your recent play history including song info, achievement, and combo/sync status.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "recent:detailed:read": {
    name: "Recent Plays Detailed (Read)",
    description: "Adds venue and full per-note-type breakdown to recent play results.",
    destructive: false,
    sensitive: false,
    default: false,
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  "stats:read": {
    name: "Stats (Read)",
    description: "Read your grade/FC/FS distribution statistics.",
    destructive: false,
    sensitive: false,
    default: false,
  },

  // ── Albums ────────────────────────────────────────────────────────────────
  "album:read": {
    name: "Albums (Read)",
    description: "Read your arcade photo album entries (metadata only, no image URLs).",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "album:images:read": {
    name: "Album Images (Read)",
    description: "Adds resolved image URLs to album responses. Sensitive: photos may contain images of people.",
    destructive: false,
    sensitive: true,
    default: false,
  },

  // ── Plates ────────────────────────────────────────────────────────────────
  "plate:read": {
    name: "Plates (Read)",
    description: "Read your plate completion data (which songs still need to be cleared / FC'd / AP'd for each plate).",
    destructive: false,
    sensitive: false,
    default: false,
  },

  // ── User: settings ────────────────────────────────────────────────────────
  "user:settings:read": {
    name: "User Settings (Read)",
    description: "Read your privacy and profile-display settings (publish profile, show scores, show plates, etc.).",
    destructive: false,
    sensitive: false,
    default: false,
  },

  // ── Snapshot: destructive ─────────────────────────────────────────────────
  "snapshot:all:delete": {
    name: "Snapshots (Delete)",
    description: "Delete any of your snapshots. Destructive: must be requested explicitly and is never implied by encompassing scopes.",
    destructive: true,
    sensitive: true,
    default: false,
  },

  // ── Snapshot: submit (internal) ───────────────────────────────────────────
  // Reserved for first-party tooling (the userscript-server). Internal scopes
  // are stripped from the public OpenAPI document and may only be minted by
  // admin-role users; see hooks.before in src/lib/auth.ts and the tRPC guard
  // in src/server/routers/developer.ts. End users should never authorize a
  // client that holds this scope; the userscript reaches the submit endpoint
  // by talking to our own server, which uses a server-side credential.
  "snapshot:submit": {
    name: "Snapshots (Submit)",
    description: "Submit a new snapshot. Internal: admin only.",
    destructive: true,
    sensitive: true,
    default: false,
    internal: true,
  },

  // ── Fetch control ─────────────────────────────────────────────────────────
  "fetch:read": {
    name: "Fetch Status (Read)",
    description: "Read the status of your in-progress or most-recent maimai data fetch.",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "fetch:start": {
    name: "Start Fetch",
    description: "Trigger a new maimai data fetch using your stored upstream token. Destructive: consumes upstream API budget and writes a new snapshot.",
    destructive: true,
    sensitive: false,
    default: false,
  },
  "fetch:delete": {
    name: "Fetch Token (Delete)",
    description: "Delete your stored upstream maimai authentication token. Destructive and sensitive: breaks any in-app and API-driven fetch flow until you re-authenticate.",
    destructive: true,
    sensitive: true,
    default: false,
  },

  // ── Encompassing scopes ───────────────────────────────────────────────────
  "snapshot:latest:read": {
    name: "Latest Snapshot (Read)",
    description: "Read metadata, song scores, and events for your latest snapshot only. Excludes icon (opt-in for privacy).",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "snapshot:all:read": {
    name: "All Snapshots (Read)",
    description: "Read metadata, song scores, and events for all your snapshots, including the latest. Excludes icon (opt-in for privacy).",
    destructive: false,
    sensitive: false,
    default: false,
  },
  "read": {
    name: "Read (All Non-Sensitive)",
    description: "Broad read access: user metadata, all snapshots, recents, stats, and albums. Excludes icon and album image URLs; those must be granted explicitly. Sensitive due to broad personal data access.",
    destructive: false,
    sensitive: true,
    default: false,
  },
} as const;

export type ScopeKey = keyof typeof API_SCOPES;

export function scopesToPermissions(scopes: ScopeKey[]) {
  return Object.fromEntries(scopes.map((s) => [s, ["access"]]));
}

/** Internal scopes are stripped from the public OpenAPI doc and may only be
 *  minted by admin-role users. */
export function isInternalScope(s: string): boolean {
  const def = (API_SCOPES as Record<string, { internal?: boolean } | undefined>)[s];
  return def?.internal === true;
}

/** Leaf scopes that each encompassing scope expands to (source scope is NOT stored). */
export const SCOPE_EXPANSIONS: Partial<Record<ScopeKey, ScopeKey[]>> = {
  "snapshot:latest:read": [
    "snapshot:latest:metadata:read",
    "snapshot:latest:songs:read",
    "snapshot:latest:events:read",
  ],
  // snapshot:all:read expands to all:* leaf scopes; SCOPE_IMPLIES then transitively
  // grants the corresponding snapshot:latest:* scopes automatically.
  "snapshot:all:read": [
    "snapshot:all:metadata:read",
    "snapshot:all:songs:read",
    "snapshot:all:events:read",
  ],
  // read: only lists snapshot:all:*; the snapshot:latest:* scopes are covered by
  // SCOPE_IMPLIES (all:* ⊇ latest:*), so listing them here would be redundant.
  "read": [
    "user:metadata:read",
    "user:settings:read",
    "snapshot:all:metadata:read",
    "snapshot:all:songs:read",
    "snapshot:all:events:read",
    "recent:read",
    "recent:detailed:read",
    "stats:read",
    "album:read",
    "plate:read",
    "fetch:read",
  ],
};

/**
 * Superset implications: selecting scope A also grants scope B.
 * Unlike SCOPE_EXPANSIONS, the source scope itself is still stored.
 * Implications are applied transitively.
 */
export const SCOPE_IMPLIES: Partial<Record<ScopeKey, ScopeKey[]>> = {
  // All-snapshot access implies the corresponding latest-snapshot access (all ⊇ latest)
  "snapshot:all:metadata:read": ["snapshot:latest:metadata:read"],
  "snapshot:all:songs:read": ["snapshot:latest:songs:read", "snapshot:all:songs:b50:read"],
  "snapshot:all:songs:b50:read": ["snapshot:latest:songs:b50:read"],
  "snapshot:all:events:read": ["snapshot:latest:events:read"],
  "snapshot:all:icon:read": ["snapshot:latest:icon:read"],
  // All-songs access implies B50 access (full scores ⊇ B50 subset)
  "snapshot:latest:songs:read": ["snapshot:latest:songs:b50:read"],
  // Extended scopes imply their base scope (detailed ⊇ basic)
  "recent:detailed:read": ["recent:read"],
  "album:images:read": ["album:read"],
};

function addWithImplications(result: Set<ScopeKey>, scope: ScopeKey) {
  if (result.has(scope)) return;
  result.add(scope);
  const implies = SCOPE_IMPLIES[scope];
  if (implies) for (const implied of implies) addWithImplications(result, implied);
}

/**
 * Expand any encompassing scopes in the list to their constituent leaf scopes,
 * and apply superset implications (e.g. songs:read also grants songs:b50:read).
 * Always includes the `ready` default scope.
 */
export function expandScopes(scopes: ScopeKey[]): ScopeKey[] {
  const result = new Set<ScopeKey>(["ready"]);
  for (const scope of scopes) {
    const expansion = SCOPE_EXPANSIONS[scope];
    if (expansion) {
      for (const leaf of expansion) {
        addWithImplications(result, leaf);
      }
    } else {
      addWithImplications(result, scope);
    }
  }
  return Array.from(result);
}
