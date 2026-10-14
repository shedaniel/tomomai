"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart3, Trophy } from "lucide-react";
import { Button } from "@tomomai/ui";
import { useAccount } from "../account/AccountProvider";

/** Leaderboard and stats shortcuts that sit under the share button once a game ends. */
export function ResultActions({ dateSlug }: { dateSlug?: string }) {
  const t = useTranslations("guess.board");
  const { enabled, viewer, openStats } = useAccount();
  if (!enabled) return null;
  return (
    <div className="flex gap-2">
      <Button asChild variant="outline" className="flex-1">
        <Link href={`/leaderboard${dateSlug ? `/${dateSlug}` : ""}`}>
          <Trophy />
          {t("fullBoard")}
        </Link>
      </Button>
      {viewer && (
        <Button variant="outline" className="flex-1" onClick={openStats}>
          <BarChart3 />
          {t("yourStats")}
        </Button>
      )}
    </div>
  );
}
