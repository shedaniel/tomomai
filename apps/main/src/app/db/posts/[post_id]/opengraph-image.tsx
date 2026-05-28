import { getPostBySlug } from "@/lib/posts";
import { createOGImage, OG_SIZE } from "@/lib/og";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/locale";
import { getOGImageLocales } from "@/i18n/og-locale";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ post_id: string }>;
};

export async function generateImageMetadata() {
  const locales = await getOGImageLocales();
  return locales.map(locale => ({ id: locale, alt: "Post", size: OG_SIZE, contentType: "image/png" as const }));
}

export default async function Image({ params, id }: Props & { id: Promise<string> }) {
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
    section: t("title"),
    title: post?.title ?? "tomomai",
    summary: post?.summary,
    label: date,
    locale,
  });
}
