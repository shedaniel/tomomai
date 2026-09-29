import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import { FetchToast, type FetchToastState } from "./fetch-toast";
import { GameProvider } from "./providers/game-provider";
import { calculateProgress, parseStatusStates, type FetchState } from "@/lib/fetch-states";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import type { CanonicalGameId } from "@/lib/games/types";
import messages from "../../messages/en.json";

function renderToast(state: FetchToastState, game: CanonicalGameId = "chunithm") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ fetchToast: messages.fetchToast }} timeZone="UTC">
      <GameProvider game={{ ...toFrontendGame(getGame(game), ["jp"]), capabilities: ["scores"] }}>
        <FetchToast state={state} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

it("uses the CHUNITHM stage denominator and labels ULTIMA without maimai extras", () => {
  const statusStates: FetchState[] = ["login", "player_data", "song_data:basic", "song_data:ultima"];
  expect(calculateProgress(statusStates, "chunithm")).toBe(50);
  const markup = renderToast({ id: "session", status: "pending", startedAt: new Date(), statusStates });
  expect(markup).toContain("Fetched BASIC scores");
  expect(markup).toContain("Fetched ULTIMA scores");
  expect(markup).not.toContain("Re:MASTER");
  expect(markup).not.toContain("UTAGE");
  expect(calculateProgress([...statusStates, "song_data:basic", "album_data"], "chunithm")).toBe(50);
});

it("counts maimai stages, including a BASIC stage stored under its earlier name, and labels them from the maimai difficulties", () => {
  const statusStates = parseStatusStates("login,player_data,song_data:easy,song_data:remaster");
  expect(statusStates).toEqual(["login", "player_data", "song_data:basic", "song_data:remaster"]);
  expect(calculateProgress(statusStates, "maimai")).toBe(36);
  const markup = renderToast({ id: "session", status: "pending", startedAt: new Date(), statusStates }, "maimai");
  expect(markup).toContain("Logged in");
  expect(markup).toContain("Fetched BASIC scores");
  expect(markup).toContain("Fetched Re:MASTER scores");
});

it("shows subscription recovery instructions instead of an internal error prefix", () => {
  const markup = renderToast({
    id: "session", status: "failed", startedAt: new Date(), statusStates: [],
    errorMessage: "SUBSCRIPTION_REQUIRED: unavailable records",
  });
  expect(markup).toContain("Purchase or renew it, then retry.");
  expect(markup).toContain("Your saved login and existing data have been kept.");
  expect(markup).not.toContain("SUBSCRIPTION_REQUIRED");
});
