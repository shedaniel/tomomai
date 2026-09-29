import "server-only";
import { after } from "next/server";
import { getGame } from "@/lib/games/registry";
import { resolveBaseUrl } from "@/lib/base-url";
import { regionDisplayName } from "@/lib/discord/i18n";
import { flushLogger } from "@/lib/logger";
import { getLogger } from "@/lib/request-logger";
import type { CanonicalGameId, GameRegionContext } from "@/lib/games/types";
import type { Region } from "@/lib/types";

// Discord rejects an embed whose description exceeds 4096 chars with a 400.
// Cut at a line boundary and mark the truncation so the message still posts.
const DISCORD_DESC_LIMIT = 4096;
function truncateForDiscord(description: string): string {
  if (description.length <= DISCORD_DESC_LIMIT) return description;
  const marker = "\n… (truncated)";
  const budget = DISCORD_DESC_LIMIT - marker.length;
  const cut = description.lastIndexOf("\n", budget);
  return description.slice(0, cut > budget * 0.5 ? cut : budget).trimEnd() + marker;
}

// Vercel freezes the function as soon as the response is sent, killing any
// in-flight fetch that wasn't registered with after(). Run webhook delivery
// here so it survives the freeze, and flush logs afterwards so the outcome is
// actually observable (a bare fire-and-forget loses both the request and its
// logs). Falls back to best-effort when called outside a request scope.
function deliverInBackground(work: () => Promise<void>) {
  const task = (async () => {
    try {
      await work();
    } catch (error) {
      getLogger().error({ err: error }, "Discord delivery threw");
    } finally {
      await flushLogger().catch(() => { });
    }
  })();
  try {
    after(task);
  } catch {
    void task; // outside a request scope (scripts/tests), best effort
  }
}

export type DiscordEmbed = {
  title: string;
  description?: string;
  color: number;
  timestamp: string;
};

// Posts as the game's bot identity, whichever game the deployment serves.
export function postDiscordEmbed(webhookUrl: string, { game, region }: GameRegionContext, embed: DiscordEmbed): void {
  const { brand } = getGame(game);
  const payload = {
    username: brand.japaneseName,
    ...(brand.icon && { avatar_url: `${resolveBaseUrl()}${brand.icon}` }),
    embeds: [{ ...embed, description: embed.description && truncateForDiscord(embed.description) }],
  };

  deliverInBackground(async () => {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const log = getLogger();
    if (!response.ok) {
      const body = await response.text();
      log.error({ game, region, status: response.status, statusText: response.statusText, body }, "Discord webhook failed");
    } else {
      log.info({ game, region }, "Discord webhook sent");
    }
  });
}

export async function sendDiscordNotice(
  game: CanonicalGameId,
  region: Region,
  title: string,
  description: string,
  color: number = 0x5865F2,
) {
  const webhookUrl = process.env.DISCORD_UPDATE_WEBHOOK_NOTICE;
  if (!webhookUrl) return;

  postDiscordEmbed(webhookUrl, { game, region }, {
    title: `[${getGame(game).brand.displayName} / ${regionDisplayName(region)}] ${title}`,
    description: description.trim() || undefined,
    color,
    timestamp: new Date().toISOString(),
  });
}
