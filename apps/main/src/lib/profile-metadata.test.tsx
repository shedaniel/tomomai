import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AbstractIntlMessages } from "next-intl";

const { fetchProfile, createHomeOGImage } = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
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
vi.mock("@/lib/games/frontend-server", () => ({
  getFrontendGame: () => ({ id: "maimai", displayName: "maimai DX", productName: "tomomai", enabled: true, regions: ["intl", "jp"], capabilities: ["scores", "plates"] }),
}));
vi.mock("@/server/queries/game-profile", () => ({ fetchPublicGameProfile: fetchProfile }));
vi.mock("@/lib/auth-server", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/flags", () => ({ defaultFlags: {} }));
vi.mock("@/components/profile-page", () => ({ ProfilePage: () => null }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "ja", setStaticLocale: async () => undefined }));
vi.mock("@/i18n/og-locale", () => ({ getOGImageLocales: async () => ["ja"] }));
vi.mock("@/lib/og", () => ({ createHomeOGImage, OG_SIZE: { width: 1200, height: 630 } }));

import RegionProfilePage, { generateMetadata } from "@/app/[locale]/profile/[username]/[region]/page";
import HomeOGImage from "@/app/[locale]/opengraph-image";

const params = Promise.resolve({ locale: "ja", username: "player", region: "intl" });

beforeEach(() => {
  vi.clearAllMocks();
  fetchProfile.mockResolvedValue({ profile: { id: "user" }, snapshotData: null });
});

describe("parameterized page metadata", () => {
  it("formats empty profile metadata with the same branded title", async () => {
    const metadata = await generateMetadata({ params });
    expect(metadata.title).toBe("player | tomomai ともマイ");
  });

  it("formats the public profile JSON-LD with all required variables", async () => {
    const page = await RegionProfilePage({ params });
    const jsonLd = page.props.children[0].props.dangerouslySetInnerHTML.__html;
    expect(JSON.parse(jsonLd).name).toBe("player | tomomai ともマイ");
  });

  it("formats the home Open Graph description with the selected game", async () => {
    await HomeOGImage({ id: Promise.resolve("ja") });
    expect(createHomeOGImage).toHaveBeenCalledWith(expect.objectContaining({ tagline: expect.stringContaining("maimai DX") }));
  });
});
