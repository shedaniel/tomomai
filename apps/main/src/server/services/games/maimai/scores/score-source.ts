import "server-only";
import type { TokenOf, TokenProvider } from "@/lib/games/token-format";
import type { FetchRun } from "@/server/services/games/fetch-run";
import { acceptToken } from "@/server/services/games/token-policy";
import type { ScoreFetchContext, ScoreFetchOutcome } from "@/server/services/games/types";
import { fetchFromDivingFish } from "./providers/divingfish";
import { fetchFromLxns } from "./providers/lxns";
import { fetchWithCnCookies, fetchWithSegaLogin } from "./providers/sega-scrape";

type MaimaiProvider<P extends TokenProvider> = (ctx: ScoreFetchContext, token: TokenOf<P>, run: FetchRun) => Promise<ScoreFetchOutcome>;

/** How maimai fetches with each kind of token. The region's login methods decide which kinds it accepts. */
const MAIMAI_PROVIDERS: { readonly [P in TokenProvider]: MaimaiProvider<P> } = {
  "sega-account": fetchWithSegaLogin,
  "sega-cookie": fetchWithSegaLogin,
  "cn-cookies": fetchWithCnCookies,
  lxns: fetchFromLxns,
  divingfish: fetchFromDivingFish,
};

function fetchWith<P extends TokenProvider>(provider: P, ctx: ScoreFetchContext, token: TokenOf<P>, run: FetchRun): Promise<ScoreFetchOutcome> {
  return MAIMAI_PROVIDERS[provider](ctx, token, run);
}

export async function fetchMaimaiScores(ctx: ScoreFetchContext, run: FetchRun): Promise<ScoreFetchOutcome> {
  const token = await acceptToken("maimai", ctx.userId, ctx.region, ctx.token);
  return fetchWith(token.provider, ctx, token, run);
}
