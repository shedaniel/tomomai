import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { Dashboard } from "./dashboard";
import { GameProvider } from "@/components/providers/game-provider";
import type { FrontendGame } from "@/lib/games/frontend";
import type { Flags } from "@/lib/flags";
import messages from "../../../messages/en.json";

const hooks = vi.hoisted(() => ({ snapshots: vi.fn(), fetch: vi.fn() }));
vi.mock("@/hooks/useSnapshots", () => ({ useSnapshots: hooks.snapshots }));
vi.mock("@/hooks/useFetchSession", () => ({ useFetchSession: hooks.fetch }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRouter: vi.fn(), usePathname: vi.fn(), redirect: vi.fn(), getPathname: vi.fn(),
}));

const flags: Flags = {
  historyCard: false, eventsCard: false, albumsCard: false,
  recommendationFilters: false, scorePercentile: false, settingsApplications: false,
  settingsDeveloper: false, aprilFools2026: false, customThemes: false, passkey: false,
  twitterOauth: false, developerPortal: false, apiKeyCreation: false,
  oauthAppCreation: false, userscriptFetch: false,
};

function renderUnavailable(game: FrontendGame) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={{ db: messages.db, settings: { pages: { fetch: messages.settings.pages.fetch } } }} timeZone="UTC">
      <GameProvider game={game}>
        <Dashboard user={{ id: "test-user" }} initialUserData={{ hasUsername: true, username: "player", email: "", publishProfile: false, region: "intl", role: "user" }} initialSnapshots={[]} flags={flags} latestPost={null} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

describe("unavailable game dashboard", () => {
  it.each([
    { enabled: false, regions: [] },
    { enabled: true, regions: [] },
    { enabled: false, regions: ["jp"] },
  ] as const)("does not mount player hooks for an unavailable game: %o", state => {
    const markup = renderUnavailable({ id: "chunithm", displayName: "CHUNITHM", productName: "tomochu", fetchConfigured: false, capabilities: ["scores"], ...state });
    expect(markup).toContain("tomochu ともチュウ");
    expect(markup).toContain("Player fetching for CHUNITHM is not available yet.");
    expect(markup).not.toContain("maimai");
    expect(hooks.snapshots).not.toHaveBeenCalled();
    expect(hooks.fetch).not.toHaveBeenCalled();
  });
});
