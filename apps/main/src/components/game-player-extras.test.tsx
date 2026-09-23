import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { GameAlbumList, GameRecentList } from "./game-player-extras";
import messages from "../../messages/en.json";

function render(content: React.ReactNode) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">{content}</NextIntlClientProvider>);
}

describe("normalized optional player views", () => {
  it("renders CHUNITHM recents without fabricated maimai judgments", () => {
    const markup = render(<GameRecentList game="chunithm" plays={[{ recentSongId: BigInt(1), songName: "Recent song", difficultyCode: 3, level: "14", playedAt: new Date("2026-09-01"), scoreValue: 1009000, comboStatus: 0, syncStatus: 0, clearStatus: 0 }]} />);
    expect(markup).toContain("Recent song");
    expect(markup).toContain("1,009,000");
    expect(markup).not.toContain("DX");
    expect(markup).not.toContain("critical");
  });
  it("distinguishes an unavailable album image from an empty album", () => {
    const markup = render(<GameAlbumList game="chunithm" albums={[{ id: "1", songName: "Album song", difficultyCode: 4, level: "15", takenAt: "2026-09-01", imageKey: "" }]} />);
    expect(markup).toContain("Album song");
    expect(markup).toContain("Image unavailable");
    expect(markup).not.toContain("No albums");
  });
});
