import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AbstractIntlMessages } from "next-intl";
import type { CanonicalGameId } from "@/lib/games/ids";

const { fetchProfile, createHomeOGImage, currentGame } = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  currentGame: { id: "maimai" as CanonicalGameId },
  createHomeOGImage: vi.fn((input: unknown) => input),
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { default: localizedMessages } = await import("../../messages/ja.json");
  const messages: AbstractIntlMessages = {
    dashboard: localizedMessages.dashboard,
    profileMetadata: localizedMessages.profileMetadata,
    regions: localizedMessages.regions,
  };
  return {
    getTranslations: async (input: string | { namespace: string }) => createTranslator({
      locale: "ja",
      messages,
      namespace: typeof input === "string" ? input : input.namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { toFrontendGame } = await import("@/lib/games/frontend");
  const { getGame } = await import("@/lib/games/registry");
  return { getCurrentGame: () => ({ ...toFrontendGame(getGame(currentGame.id), ["intl", "jp"]), capabilities: ["scores", "plates"] }) };
});
vi.mock("@/server/queries/game-profile", () => ({ fetchPublicGameProfile: fetchProfile }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/flags", () => ({ defaultFlags: {} }));
vi.mock("@/components/player/profile-page", () => ({ ProfilePage: () => null }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "ja", setStaticLocale: async () => undefined }));
vi.mock("@/i18n/og-locale", () => ({ getOGImageLocales: async () => ["ja"] }));
vi.mock("@/lib/og", () => ({ createHomeOGImage, OG_SIZE: { width: 1200, height: 630 } }));

import RegionProfilePage, { generateMetadata } from "@/app/[locale]/profile/[username]/[region]/page";
import HomeOGImage from "@/app/[locale]/opengraph-image";

const params = Promise.resolve({ locale: "ja", username: "player", region: "intl" });

beforeEach(() => {
  vi.clearAllMocks();
  currentGame.id = "maimai";
  fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: null });
});

describe("parameterized page metadata", () => {
  it("formats empty profile metadata with the same branded title", async () => {
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("player | tomomai ともマイ");
    expect(metadata.description).toBe("tomomai で player の maimai DX プロフィールを表示。");
  });

  it("formats the public profile JSON-LD with all required variables", async () => {
    const page = await RegionProfilePage({ params });
    const script = page.props.children.find((child: { type?: string; props?: { type?: string } }) => child?.type === "script" && child.props?.type === "application/ld+json");
    const jsonLd = script.props.dangerouslySetInnerHTML.__html;
    expect(JSON.parse(jsonLd).name).toBe("player | tomomai ともマイ");
  });

  it("brands an active CHUNITHM profile with its game and player", async () => {
    currentGame.id = "chunithm";
    fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: { snapshot: { displayName: "CHU Player", rating: 1650, game: "chunithm" }, songs: [] } });
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("tomochu ともチュウ");
    expect(metadata.description).toContain("CHUNITHM");
    expect(metadata.description).toContain("CHU Player");
    expect(metadata.description).toContain("Rating 16.50");
    expect(metadata.openGraph).not.toHaveProperty("images");
  });

  it("describes a maimai profile with its rating in the metadata and the JSON-LD", async () => {
    fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: { snapshot: { displayName: "MAI Player", rating: 15432, game: "maimai" }, songs: [] } });
    const expected = "インターナショナル の maimai DX プレイヤー MAI Player（player）、Rating 15432。tomomai でスコアと成長をチェック。";
    expect((await generateMetadata({ params })).description).toBe(expected);
    const page = await RegionProfilePage({ params });
    const script = page.props.children.find((child: { type?: string; props?: { type?: string } }) => child?.type === "script" && child.props?.type === "application/ld+json");
    expect(JSON.parse(script.props.dangerouslySetInnerHTML.__html).description).toBe(expected);
  });

  it("formats the home Open Graph description with the selected game", async () => {
    await HomeOGImage({ id: Promise.resolve("ja") });
    expect(createHomeOGImage).toHaveBeenCalledWith(expect.objectContaining({ tagline: expect.stringContaining("maimai DX") }));
  });
});
