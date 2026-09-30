// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FetchSettings } from "./fetch-settings";
import { GameProvider } from "../providers/game-provider";
import type { FrontendGame } from "@/lib/games/frontend";
import messages from "../../../messages/en.json";
import { testGame } from "@/test/games";

const state = vi.hoisted(() => ({ start: vi.fn(), region: "cn" }));
vi.mock("@/hooks/useFetchSession", () => ({ useFetchSession: () => ({ startDataFetch: state.start, fetchToastState: null }) }));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getUserData: { useQuery: () => ({ data: { region: state.region }, isLoading: false }) },
  getProfileSettings: { useQuery: () => ({ data: { fetchUseAlbums: true }, isLoading: false }) },
  setAlbumPreference: { useMutation: () => ({ mutateAsync: vi.fn() }) },
  deleteToken: { useMutation: () => ({ mutateAsync: vi.fn() }) },
} } }));
vi.mock("@/components/token-dialog/sega-cookie-wizard", () => ({ SegaCookieWizardDialog: () => <span>International cookie options</span> }));
vi.mock("@/components/games/maimai/cn-token-dialog", () => ({ CnTokenDialog: () => <span>CN token options</span> }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  state.region = "cn";
  state.start.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function render(game: FrontendGame) {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={game}><FetchSettings /></GameProvider>
    </NextIntlClientProvider>,
  ));
}

it("signs CHUNITHM Japan in with a SEGA account, without album, cookie or CN options", async () => {
  state.region = "jp";
  await render(testGame("chunithm", ["intl", "jp"]));
  expect(container.textContent).toContain("settings for CHUNITHM");
  expect(container.querySelector("#fetch-albums")).toBeNull();
  const open = Array.from(container.querySelectorAll("button")).find(button => button.textContent === messages.settings.account.updateToken);
  await act(async () => open?.click());
  expect(document.body.textContent).toContain("Update CHUNITHM authentication");
  expect(document.body.textContent).toContain("authenticate with CHUNITHM-NET");
  expect(document.body.textContent).not.toContain("CN token options");
  expect(document.body.textContent).not.toContain("International cookie options");
  for (const [id, value] of [["username", "test-user"], ["password", "test-password"]]) {
    const input = document.getElementById(id);
    expect(input).toBeInstanceOf(HTMLInputElement);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  await act(async () => document.querySelector("form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(state.start).toHaveBeenCalledWith("jp", "account://test-user:://test-password");
});

it("retains maimai International album settings and its configured cookie login", async () => {
  state.region = "intl";
  await render(testGame("maimai", ["intl", "jp", "cn"]));
  expect(container.textContent).toContain("settings for maimai DX");
  expect(container.querySelector("#fetch-albums")).not.toBeNull();
  expect(container.textContent).toContain("International cookie options");
});

it("hides the maimai album setting in China, where the definition withdraws albums", async () => {
  await render(testGame("maimai", ["intl", "jp", "cn"]));
  expect(container.textContent).toContain("settings for maimai DX");
  expect(container.querySelector("#fetch-albums")).toBeNull();
});
