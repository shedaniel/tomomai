import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanonicalGameId } from "@/lib/games/ids";

const current = vi.hoisted(() => ({ game: "maimai" as CanonicalGameId }));

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  const { loadMessages } = await import("@/i18n/messages");
  const translator = async (namespace: string) => createTranslator({
    locale: "en",
    messages: await loadMessages(current.game, "en"),
    namespace,
    onError(error) { throw error; },
  });
  return {
    getTranslations: (options: string | { namespace: string }) => translator(typeof options === "string" ? options : options.namespace),
  };
});
vi.mock("@/lib/games/current", async () => {
  const { testGame } = await import("@/test/games");
  return { getCurrentGame: () => testGame(current.game, ["intl", "jp"]) };
});
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next-mdx-remote/rsc", () => ({ MDXRemote: () => null }));
vi.mock("@/i18n/locale-server", () => ({ getLocale: async () => "en", setStaticLocale: async () => {} }));
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));
vi.mock("@/lib/base-url", () => ({ resolveBaseUrl: () => "https://site.test" }));
vi.mock("@/lib/og", () => ({ createOGImage: () => new Response("image") }));
vi.mock("@/lib/posts", () => {
  const post = { slug: "2026-09-01-update", canonicalSlug: "update", locale: "en", title: "September update", date: "2026-09-01", version: "N/A", summary: "What changed", content: "" };
  return {
    getAllPostsMeta: () => [post],
    getPostBySlug: () => post,
    getAvailableTranslations: () => ["en"],
  };
});

import PostPage, { generateMetadata, generateStaticParams } from "./page";
import { MISSING_PAGE_METADATA } from "@/lib/seo";
import PostImage from "./opengraph-image";

const params = Promise.resolve({ locale: "en", post_id: "2026-09-01-update" });

beforeEach(() => { current.game = "maimai"; });

describe("changelog post", () => {
  it("is published on the maimai site", async () => {
    expect(await generateStaticParams()).toEqual([{ post_id: "2026-09-01-update" }]);
    expect((await generateMetadata({ params })).title).toBe("September update | tomomai");
    expect((await PostImage({ params, id: Promise.resolve("en") })).status).toBe(200);
  });

  it("does not exist on the CHUNITHM site", async () => {
    current.game = "chunithm";
    expect(await generateStaticParams()).toEqual([]);
    expect(await generateMetadata({ params })).toEqual(MISSING_PAGE_METADATA);
    await expect(PostPage({ params })).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await PostImage({ params, id: Promise.resolve("en") })).status).toBe(404);
  });
});
