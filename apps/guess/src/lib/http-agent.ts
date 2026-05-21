import { Agent } from "undici";

/**
 * Permissive dispatcher for fetches to maimai-side hosts (notably
 * `maimaidx.jp`, which serves cover art behind a cert chain Node doesn't
 * trust out of the box). Same pattern as apps/main/src/lib/http-agent.ts.
 *
 * Only pass this to `fetch()` calls that actually need it — don't make it
 * the global dispatcher.
 */
export const AGENT = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});
