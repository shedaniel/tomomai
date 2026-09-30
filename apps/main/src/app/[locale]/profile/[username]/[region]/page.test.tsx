import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const { fetchProfile, currentGame } = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  currentGame: { id: "maimai" as CanonicalGameId },
}));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  return {
    getTranslations: async (input: string | { namespace: string }) => createTranslator({
      locale: "ja",
      messages: await loadMessages(currentGame.id, "ja"),
      namespace: typeof input === "string" ? input : input.namespace,
      onError(error) { throw error; },
    }),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame(currentGame.id, ["intl", "jp"]) };
});
vi.mock("@/server/queries/game-profile", () => ({ fetchPublicGameProfile: fetchProfile }));
vi.mock("@/server/queries/public-access", () => ({ resolvePublicUserByUsername: vi.fn() }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/flags", () => ({ defaultFlags: {} }));
vi.mock("@/components/player/profile-page", () => ({ ProfilePage: () => null }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "ja", setStaticLocale: async () => undefined }));
vi.mock("@/i18n/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));

import RegionProfilePage, { generateMetadata } from "./page";
import { generateMetadata as generateRedirectMetadata } from "../page";

const params = Promise.resolve({ locale: "ja", username: "player", region: "intl" });
const profileImage = [{ url: "https://site.test/ja/profile/player/intl/opengraph-image/ja" }];

async function profileJsonLd() {
  const page = await RegionProfilePage({ params });
  const script = page.props.children.find((child: { type?: string; props?: { type?: string } }) => child?.type === "script" && child.props?.type === "application/ld+json");
  return JSON.parse(script.props.dangerouslySetInnerHTML.__html);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentGame.id = "maimai";
  fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: null });
});

describe("regional profile metadata", () => {
  it("previews a profile without a snapshot with its branded title and image", async () => {
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("player | tomomai ともマイ");
    expect(metadata.description).toBe("tomomai で player の maimai DX プロフィールを表示。");
    expect(metadata.openGraph).toMatchObject({ title: "player | tomomai ともマイ", siteName: "tomomai ともマイ", type: "profile", images: profileImage });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image", description: metadata.description });
    expect((await profileJsonLd()).name).toBe("player | tomomai ともマイ");
  });

  it("brands an active CHUNITHM profile with its game, player and image", async () => {
    currentGame.id = "chunithm";
    fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: { snapshot: { displayName: "CHU Player", rating: 1650, game: "chunithm" }, songs: [] } });
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toContain("tomochu ともチュウ");
    expect(metadata.description).toContain("CHUNITHM");
    expect(metadata.description).toContain("CHU Player");
    expect(metadata.description).toContain("Rating 16.50");
    expect(metadata.openGraph?.images).toMatchObject(profileImage);
  });

  it("describes a maimai profile with its rating in the metadata and the JSON-LD", async () => {
    fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: { snapshot: { displayName: "MAI Player", rating: 15432, game: "maimai" }, songs: [] } });
    const expected = "インターナショナル の maimai DX プレイヤー MAI Player（player）、Rating 15432。tomomai でスコアと成長をチェック。";
    const metadata = await generateMetadata({ params });
    expect(metadata.description).toBe(expected);
    expect(metadata.openGraph?.images).toMatchObject(profileImage);
    expect((await profileJsonLd()).description).toBe(expected);
  });
});

describe("profile redirect metadata", () => {
  it("publishes no image of its own, since the region it redirects to is only known from the database", async () => {
    for (const game of ["maimai", "chunithm"] as const) {
      currentGame.id = game;
      const metadata = await generateRedirectMetadata({ params: Promise.resolve({ locale: "ja", username: "player" }) });
      expect(metadata.openGraph).toMatchObject({ url: "/ja/profile/player", type: "profile", images: [] });
    }
  });
});
