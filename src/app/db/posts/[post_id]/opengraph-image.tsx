import { getPostBySlug } from "@/lib/posts";
import { createOGImage, OG_SIZE } from "@/lib/og";
import { getLocale } from "@/i18n/locale-server";
import { getTranslations } from "next-intl/server";

export const runtime = "nodejs";
export const alt = "Post";
export const size = OG_SIZE;
export const contentType = "image/png";

type Props = {
  params: Promise<{ post_id: string }>;
};

export default async function Image({ params }: Props) {
  const { post_id } = await params;
  const locale = await getLocale();
  const post = getPostBySlug(post_id, locale);
  const t = await getTranslations("db.posts.list");

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
