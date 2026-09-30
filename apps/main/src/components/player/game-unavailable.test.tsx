import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameUnavailable } from "./game-unavailable";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";
import { loadMessages } from "@/i18n/messages";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

describe("unavailable game screen", () => {
  it("names the served game and offers its catalog", async () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={await loadMessages("chunithm", "en")} timeZone="UTC">
        <GameProvider game={toFrontendGame(getGame("chunithm"), [])}>
          <GameUnavailable />
        </GameProvider>
      </NextIntlClientProvider>,
    );
    expect(markup).toContain("tomochu ともチュウ");
    expect(markup).toContain("Player features for CHUNITHM are not available yet.");
    expect(markup).toContain('href="/db/songs"');
    expect(markup).not.toContain("maimai");
  });
});
