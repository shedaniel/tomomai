// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OnboardingDialog } from "./onboarding-dialog";
import { GameProvider } from "./providers/game-provider";
import { loadMessages } from "@/i18n/messages";
import messages from "../../messages/en.json";
import { testGame } from "@/test/games";

const chunithmMessages = await loadMessages("chunithm", "en");

const mutations = vi.hoisted(() => ({ updateRegion: vi.fn(), updateProfileMainRegion: vi.fn(), updatePublishProfile: vi.fn() }));
vi.mock("@/lib/trpc-client", () => ({ trpc: {
  username: {
    getSuggestedUsername: { useQuery: () => ({ data: undefined }) },
    checkUsernameAvailability: { useQuery: () => ({ data: undefined, isFetching: false, isLoading: false }) },
    setUsername: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
  },
  user: {
    updatePublishProfile: { useMutation: () => ({ mutateAsync: mutations.updatePublishProfile, isPending: false }) },
    updateRegion: { useMutation: () => ({ mutateAsync: mutations.updateRegion, isPending: false }) },
    updateProfileMainRegion: { useMutation: () => ({ mutateAsync: mutations.updateProfileMainRegion, isPending: false }) },
  },
} }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() });
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  vi.stubEnv("NEXT_PUBLIC_ENABLED_MAIMAI_REGIONS", "intl,jp,cn");
  for (const mutation of Object.values(mutations)) mutation.mockReset().mockResolvedValue({ success: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllEnvs();
});

function button(label: string) {
  return Array.from(document.querySelectorAll("button")).find(candidate => candidate.textContent?.includes(label));
}

it("offers only the served game's regions and saves the chosen one", async () => {
  await act(async () => root.render(
    <NextIntlClientProvider locale="en" messages={chunithmMessages} timeZone="UTC">
      <GameProvider game={testGame("chunithm", ["intl", "jp"])}>
        <OnboardingDialog open onComplete={vi.fn()} initialRegion="intl" initialUsername="player" initialPublishProfile={false} />
      </GameProvider>
    </NextIntlClientProvider>,
  ));
  expect(document.body.textContent).toContain("Welcome to tomochu!");
  expect(document.body.textContent).toContain("Your username is your handle on tomochu.");
  await act(async () => button(messages.onboarding.navigation.next)?.click());

  expect(document.body.textContent).toContain("Pick where your CHUNITHM data lives.");
  expect(document.body.textContent).toContain("チュウニズム");
  expect(document.body.textContent).not.toMatch(/tomomai|ともマイ|でらっくす/);
  expect(button(messages.regions.intl)).toBeDefined();
  expect(button(messages.regions.cn)).toBeUndefined();

  await act(async () => button(messages.regions.jp)?.click());
  await act(async () => button(messages.onboarding.navigation.next)?.click());
  expect(mutations.updateRegion).toHaveBeenCalledWith({ region: "jp" });
  expect(mutations.updateProfileMainRegion).toHaveBeenCalledWith({ profileMainRegion: "jp" });
});
