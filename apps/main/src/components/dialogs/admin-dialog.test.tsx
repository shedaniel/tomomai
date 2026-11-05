// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import type { CanonicalGameId, Region } from "@/lib/games/ids";
import { getCurrentVersion } from "@/lib/games/versions";
import messages from "../../../messages/en.json";
import { AdminDialog } from "./admin-dialog";
import { testGame } from "@/test/games";

vi.mock("./users-browser-dialog", () => ({ UsersBrowserDialog: () => null }));
vi.mock("./profile-reports-dialog", () => ({ ProfileReportsDialog: () => null }));

let root: Root;
const fetch = vi.fn<typeof globalThis.fetch>();
const stored = new Map<string, string>();
// Node's own localStorage shadows jsdom's and is unavailable without --localstorage-file.
const localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
};
const render = (game: CanonicalGameId, regions: Region[]) => act(async () => root.render(
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <GameProvider game={testGame(game, regions)}><AdminDialog open onOpenChange={() => {}} /></GameProvider>
  </NextIntlClientProvider>,
));
const click = (id: string) => act(async () => document.getElementById(id)!.click());
const requested = () => fetch.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  vi.stubGlobal("fetch", fetch);
  fetch.mockReset().mockImplementation(async () => Response.json({ success: true, records: [{ songName: "Song" }] }));
  stored.clear();
  vi.stubGlobal("localStorage", localStorage);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it("runs every catalog action against the site's game and previews with update=noop", async () => {
  await render("chunithm", ["intl", "jp"]);
  await click("fetch-jp-new-songs");
  await click("preview-jp-changes");
  expect(requested()).toEqual([
    "/api/admin/update?game=chunithm&region=jp",
    `/api/admin/upload?game=chunithm&region=jp&version=${getCurrentVersion("chunithm", "jp")}&update=noop`,
  ]);
});

it("sends the saved maimai source token only where the catalog source logs in", async () => {
  localStorage.setItem("catalogSourceToken:maimai", "cookie://saved");
  await render("maimai", ["intl", "jp", "cn"]);
  await click("fetch-jp-new-songs");
  await click("fetch-cn-new-songs");
  await click("normalize-jp-database");
  expect(requested()).toEqual([
    `/api/admin/update?game=maimai&region=jp&token=${encodeURIComponent("cookie://saved")}`,
    "/api/admin/update?game=maimai&region=cn",
    "/api/admin/db?game=maimai&type=normalize&region=jp",
  ]);
});
