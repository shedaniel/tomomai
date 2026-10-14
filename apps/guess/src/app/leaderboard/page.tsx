import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LeaderboardPage } from "@/components/board/LeaderboardPage";
import { getRealTodayKey } from "@/lib/date-slug";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guess.leaderboard");
  return { title: t("metaTitle"), robots: { index: false } };
}

export default function TodayLeaderboard() {
  return <LeaderboardPage dateKey={getRealTodayKey()} />;
}
