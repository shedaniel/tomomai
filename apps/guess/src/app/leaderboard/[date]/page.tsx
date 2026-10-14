import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LeaderboardPage } from "@/components/board/LeaderboardPage";
import { isTodaySlug, parsePastDateSlug } from "@/lib/date-slug";

type Props = { params: Promise<{ date: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guess.leaderboard");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default async function DateLeaderboard({ params }: Props) {
  const { date: slug } = await params;
  if (isTodaySlug(slug)) redirect("/leaderboard");
  const dateKey = parsePastDateSlug(slug);
  if (!dateKey) notFound();
  return <LeaderboardPage dateKey={dateKey} />;
}
