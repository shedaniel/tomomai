import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GameProvider } from "@/components/providers/game-provider";
import { SongChartDialogGrid } from "./song-detail-dialog";
import type { FrontendGame } from "@/lib/games/frontend";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

const descriptor: FrontendGame = { id: "chunithm", productName: "tomochu", displayName: "CHUNITHM", enabled: false, regions: ["jp"], capabilities: ["rating"] };
const chart = { difficulty: "ultima", region: "jp" as const, gameVersion: 14, level: "14", levelPrecise: 140, addedVersion: 14, noteDesigner: null, tapCount: null, holdCount: null, slideCount: null, touchCount: null, breakCount: null };
const score = { scoreValue: 1009000, comboStatus: 2, syncStatus: 1, clearStatus: 2 };

describe("shared catalog rating dialog", () => {
  it("renders CHUNITHM scores as integers and rating hundredths using the common component", () => {
    const html = renderToStaticMarkup(<GameProvider game={descriptor}><SongChartDialogGrid chart={chart} score={score} /></GameProvider>);
    expect(html).toContain("1,009,000");
    expect(html).toContain("16.15");
    expect(html).toContain("db.songs.detail.score");
    expect(html).not.toContain("%");
    expect(html).not.toContain(">AP<");
  });

  it("preserves maimai achievement precision and the AP rating row through the same component", () => {
    const html = renderToStaticMarkup(<GameProvider game={{ ...descriptor, id: "maimai", productName: "tomomai" }}><SongChartDialogGrid chart={{ ...chart, difficulty: "master" }} score={{ ...score, scoreValue: 1001423 }} /></GameProvider>);
    expect(html).toContain("100.1423%");
    expect(html).toContain(">AP<");
    expect(html).toContain("db.songs.detail.achievement");
  });
});
