import { getPostBySlug } from "@/lib/posts";
import { getCurrentGame } from "@/lib/games/current";
import { getCatalogSection } from "@/lib/games/frontend";
import { createOGImage } from "@/lib/og";
import { ogImageVariants } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ post_id: string }>;
};

export async function generateImageMetadata() {
  return ogImageVariants("Post");
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
  const game = getCurrentGame();
  if (!getCatalogSection(game, "posts")) return new Response(null, { status: 404 });
  const [{ post_id }, locale] = await Promise.all([params, id]) as [{ post_id: string }, Locale];
  const post = getPostBySlug(post_id, locale);
  const t = await getTranslations({ locale, namespace: "db.posts.list" });

  const date = post?.date
    ? new Date(post.date).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : undefined;

  return createOGImage({
    brand: game.brand,
    section: t("title"),
    title: post?.title ?? game.brand.productName,
    summary: post?.summary,
    label: date,
    locale,
  });
}
