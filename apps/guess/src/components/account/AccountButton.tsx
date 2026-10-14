"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3, LogIn, LogOut, Trophy, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@tomomai/ui";
import { useAccount } from "./AccountProvider";
import { PlayerAvatar } from "./PlayerAvatar";

const triggerClass =
  "rounded-full outline-none transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function AccountButton() {
  const t = useTranslations("guess.account");
  const router = useRouter();
  const { enabled, viewer, setViewer, openStats, signInHref } = useAccount();
  if (!enabled) return null;

  if (!viewer) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className={triggerClass} aria-label={t("menu")}>
          <PlayerAvatar name={null} className="ring-1 ring-border" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5 font-normal">
            <div className="text-sm font-semibold">{t("guest")}</div>
            <div className="text-xs leading-snug text-muted-foreground">{t("guestHint")}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href={signInHref()}>
              <LogIn />
              {t("signIn")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/leaderboard">
              <Trophy />
              {t("leaderboard")}
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setViewer(null);
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={triggerClass} aria-label={t("menu")}>
        <PlayerAvatar image={viewer.image} name={viewer.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 font-normal">
          <PlayerAvatar image={viewer.image} name={viewer.name} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{viewer.name}</div>
            <div className="text-xs text-muted-foreground">{t("signedInWith")}</div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openStats}>
          <BarChart3 />
          {t("stats")}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/leaderboard">
            <Trophy />
            {t("leaderboard")}
          </Link>
        </DropdownMenuItem>
        {viewer.profileUrl && (
          <DropdownMenuItem asChild>
            <a href={viewer.profileUrl} target="_blank" rel="noreferrer">
              <UserRound />
              {t("profile")}
            </a>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
