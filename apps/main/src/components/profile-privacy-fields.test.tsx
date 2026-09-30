import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { GameProvider } from "@/components/providers/game-provider";
import { toFrontendGame } from "@/lib/games/frontend";
import type { CanonicalGameId } from "@/lib/games/ids";
import { getGame } from "@/lib/games/registry";
import type { ProfilePrivacySettings } from "@/lib/types";
import { ProfilePrivacyFields } from "./profile-privacy-fields";
import messages from "../../messages/en.json";

const allShown: ProfilePrivacySettings = {
  profileShowAllScores: true,
  profileShowScoreDetails: true,
  profileShowPlates: true,
  profileShowPlayCounts: true,
  profileShowEvents: true,
  profileShowInSearch: true,
};

function render(game: CanonicalGameId) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <GameProvider game={toFrontendGame(getGame(game), ["jp"])}>
        <ProfilePrivacyFields value={allShown} onChange={() => {}} />
      </GameProvider>
    </NextIntlClientProvider>,
  );
}

describe("profile privacy fields", () => {
  it("offers the maimai plate and event toggles", () => {
    const html = render("maimai");
    expect(html).toContain("Show Plates");
    expect(html).toContain("Show Events");
    expect(html).toContain("Display your maimai DX play counts.");
  });

  it("hides toggles for features CHUNITHM does not have", () => {
    const html = render("chunithm");
    expect(html).not.toContain("Show Plates");
    expect(html).not.toContain("Show Events");
    expect(html).toContain("Show All Scores");
    expect(html).toContain("Display your CHUNITHM play counts.");
  });
});
