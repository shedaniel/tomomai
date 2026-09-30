// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PrivacySettings } from "./privacy-settings";
import { GameProvider } from "../providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { loadMessages } from "@/i18n/messages";
import type { ProfileSettings } from "@/lib/types";

const messages = await loadMessages("chunithm", "en");

const state = vi.hoisted(() => ({
  settings: null as ProfileSettings | null,
  mutations: { updatePublishProfile: vi.fn(), updateProfileMainRegion: vi.fn(), updateProfilePrivacySettings: vi.fn() },
}));
vi.mock("@/lib/trpc-client", () => ({ trpc: { user: {
  getUserData: { useQuery: () => ({ data: { username: "player" } }) },
  getProfileSettings: { useQuery: () => ({ data: state.settings, isLoading: false }) },
  updatePublishProfile: { useMutation: () => ({ mutateAsync: state.mutations.updatePublishProfile }) },
  updateProfileMainRegion: { useMutation: () => ({ mutateAsync: state.mutations.updateProfileMainRegion }) },
  updateProfilePrivacySettings: { useMutation: () => ({ mutateAsync: state.mutations.updateProfilePrivacySettings }) },
} } }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  state.settings = {
    publishProfile: true, profileDescription: null, profileMainRegion: "cn", profileShowAllScores: true, profileShowScoreDetails: true,
    profileShowPlates: true, profileShowPlayCounts: true, profileShowEvents: true, profileShowInSearch: true, fetchUseAlbums: null,
  };
  for (const mutation of Object.values(state.mutations)) mutation.mockReset().mockResolvedValue({ success: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function button(label: string) {
  return Array.from(container.querySelectorAll("button")).find(candidate => candidate.textContent?.includes(label));
}

it("shows the game's main region and saves only a region the user picks", async () => {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={toFrontendGame(getGame("chunithm"), ["intl", "jp"])}><PrivacySettings /></GameProvider>
    </NextIntlClientProvider>,
  ));
  expect(container.textContent).toContain("Choose the primary region of your published CHUNITHM profile.");
  expect(container.querySelector("#main-region")?.textContent).toContain("International");
  expect(button("Save Changes")?.disabled).toBe(true);

  await act(async () => button("Japan")?.click());
  await act(async () => button("Save Changes")?.click());
  expect(state.mutations.updateProfileMainRegion).toHaveBeenCalledWith({ profileMainRegion: "jp" });
  expect(state.mutations.updatePublishProfile).not.toHaveBeenCalled();
  expect(state.mutations.updateProfilePrivacySettings).not.toHaveBeenCalled();
});
