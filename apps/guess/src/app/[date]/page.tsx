import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@tomomai/i18n/server";
import { GamePage } from "@/components/GamePage";
import { isTodaySlug, parsePastDateSlug } from "@/lib/date-slug";
import { buildGuessMetadata, metaNamespace } from "@/lib/metadata";

type Props = {
  params: Promise<{ date: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { date: slug } = await params;
  const dateKey = parsePastDateSlug(slug);
  if (!dateKey) return {};
  const [t, locale] = await Promise.all([
    getTranslations(metaNamespace()),
    getLocale(),
  ]);
  return buildGuessMetadata({ t, locale, dateKey, dateSlug: slug });
}

export default async function DateGamePage({ params }: Props) {
  const { date: slug } = await params;
  // Redirect to `/` when the slug refers to today (so shared "today" links
  // collapse to the canonical homepage URL).
  if (isTodaySlug(slug)) redirect("/");
  const dateKey = parsePastDateSlug(slug);
  if (!dateKey) notFound();
  return <GamePage dateKey={dateKey} dateSlug={slug} />;
}
