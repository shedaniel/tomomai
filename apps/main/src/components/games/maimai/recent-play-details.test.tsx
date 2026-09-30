// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import type { FetchedRecentPlayDetails } from "@/lib/games/recent-details";
import { MaimaiRecentPlayDetails } from "./recent-play-details";
import messages from "../../../../messages/en.json";

const judgments = (cPerfect: number) => ({ cPerfect, perfect: 0, great: 0, good: 0, miss: 0 });
const details: FetchedRecentPlayDetails<"maimai"> = {
  game: "maimai",
  maxDxScore: 1500,
  playlog: {
    venue: null, combo: 500, maxCombo: 500, syncScore: null, maxSyncScore: null, rating: 337, ratingChange: 2, fast: 3, late: 1,
    notes: { tap: judgments(300), hold: judgments(100), slide: judgments(60), touch: judgments(20), break: judgments(20) },
  },
};

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); });

it("renders the maimai DX score, rating and judgement breakdown of a fetched playlog", async () => {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <MaimaiRecentPlayDetails details={details} play={{ scoreValue: 1010000, secondaryScore: 1500 }} />
    </NextIntlClientProvider>,
  ));
  expect(container.textContent).toContain("DX15001500");
  expect(container.textContent).toContain("337");
  expect(container.textContent).toContain("Combo500500");
  expect(container.textContent).toContain("Fast3");
  expect(container.textContent).toContain("Critical Perfect");
  expect(container.textContent).toContain("Break");
});
