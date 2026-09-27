import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { expect, it } from "vitest";
import { FetchToast, type FetchToastState } from "./fetch-toast";
import { GameProvider } from "./providers/game-provider";
import { calculateProgress, FETCH_STATES } from "@/lib/fetch-states";
import messages from "../../messages/en.json";

function renderToast(state: FetchToastState) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ fetchToast: messages.fetchToast }} timeZone="UTC">
      <GameProvider game={{ id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", enabled: true, regions: ["jp"], capabilities: ["scores"] }}>
        <FetchToast state={state} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

it("uses the CHUNITHM stage denominator and labels ULTIMA without maimai extras", () => {
  const statusStates = [FETCH_STATES.LOGIN, FETCH_STATES.PLAYER_DATA, FETCH_STATES.SONG_DATA_BASIC, FETCH_STATES.SONG_DATA_ULTIMA];
  expect(calculateProgress(statusStates, "chunithm")).toBe(50);
  const markup = renderToast({ id: "session", status: "pending", startedAt: new Date(), statusStates });
  expect(markup).toContain("Fetched ULTIMA scores");
  expect(markup).not.toContain("Re:MASTER");
  expect(markup).not.toContain("UTAGE");
  expect(calculateProgress([...statusStates, FETCH_STATES.SONG_DATA_BASIC, FETCH_STATES.ALBUM_DATA], "chunithm")).toBe(50);
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
