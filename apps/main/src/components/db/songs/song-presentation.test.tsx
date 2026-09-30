import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@/components/providers/game-provider";
import { SongChartDialogContent } from "./song-detail-dialog";
import { toFrontendGame, type FrontendGame } from "@/lib/games/frontend";
import { getGame } from "@/lib/games/registry";

vi.mock("@tomomai/ui", () => ({ ResponsiveDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2> }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const descriptor: FrontendGame = { ...toFrontendGame(getGame("chunithm"), ["jp"]), capabilities: ["rating"] };
const chart = { difficulty: "ultima" as const, region: "jp" as const, gameVersion: 14, level: "14", levelPrecise: 140, addedVersion: 14, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const score = { scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 };

describe("shared catalog rating dialog", () => {
  it("renders CHUNITHM scores as integers and rating hundredths using the common component", () => {
    const html = renderToStaticMarkup(<GameProvider game={descriptor}><SongChartDialogContent charts={[chart]} scores={{ jp: score }} /></GameProvider>);
    expect(html).toContain("1,009,000");
    expect(html).toContain("16.15");
    expect(html).toContain("db.songs.detail.score");
    expect(html.replace(/<[^>]*>/g, "")).not.toContain("%");
    expect(html).not.toContain(">AP<");
  });

  it("preserves maimai achievement precision and the AP rating row through the same component", () => {
    const html = renderToStaticMarkup(<GameProvider game={{ ...toFrontendGame(getGame("maimai"), ["jp"]), capabilities: ["rating"] }}><SongChartDialogContent charts={[{ ...chart, difficulty: "master" }]} scores={{ jp: { ...score, scoreValue: 1001423 } }} /></GameProvider>);
    expect(html).toContain("100.1423%");
    expect(html).toContain(">AP<");
    expect(html).toContain("db.songs.detail.achievement");
  });

  it("marks the level and ratings of an estimated constant", () => {
    const html = renderToStaticMarkup(<GameProvider game={descriptor}><SongChartDialogContent charts={[{ ...chart, levelPreciseEstimated: true }]} scores={{ jp: score }} /></GameProvider>);
    expect(html).toContain(">≈14</span><span class=\"text-xs\">.0</span>");
    expect(html).toContain("≈16.15");
    expect(html).toContain("1,009,000");
  });
});
