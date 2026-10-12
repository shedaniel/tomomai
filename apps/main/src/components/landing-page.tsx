"use client";

import { useEffect } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Database, UserRound } from "lucide-react";
import { Button } from "@tomomai/ui";
import { Header } from "@/components/header";
import { MinigameCards } from "@/components/minigame-cards";
import { useAuthDialog } from "@/components/auth/auth-dialog-provider";
import { Link } from "@/i18n/navigation";
import { getTransition } from "@/lib/animation-constants";
import { isCNExclusive } from "@/lib/enabled-regions";
import type { SignupRequirements } from "@/lib/signup";
import { trpc } from "@/lib/trpc-client";

interface LandingPageProps {
  signInOptions: {
    signup: SignupRequirements;
    passkey: boolean;
    twitterOauth: boolean;
  };
}

// Matches the MinigameCards look so the four links read as one grid.
function ExploreCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center justify-center rounded-md bg-primary-container p-1 text-on-primary-container">
          {icon}
        </div>
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <ArrowUpRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-balance text-muted-foreground">{description}</p>
    </Link>
  );
}

export function LandingPage({ signInOptions }: LandingPageProps) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const { openAuthDialog } = useAuthDialog();
  const cnMode = isCNExclusive();

  useEffect(() => {
    utils.user.getSignInOptions.setData(undefined, signInOptions);
  }, [utils, signInOptions]);

  // Signed-out visits to settings land here with `?signin=<path>`. Only same-site settings paths are
  // honoured, so the parameter cannot be used as an open redirect.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("signin");
    if (!next || !next.startsWith("/settings") || next.startsWith("//")) return;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    openAuthDialog({ callbackURL: next });
  }, [openAuthDialog]);

  return (
    <div className="container mx-auto max-w-[1200px] px-4 pt-8 pb-16">
      <Header currentTab="dashboard" showDiscordBanner={false} />

      <section className="grid items-center gap-10 md:pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={getTransition({ duration: 0.5, ease: [0.4, 0, 0.2, 1] })}
        >
          <h1 className="text-3xl font-bold tracking-tight text-balance md:text-4xl">{t("landing.headline")}</h1>
          <p className="mt-3 max-w-md text-pretty text-muted-foreground md:text-lg">
            {cnMode ? "从舞萌 DX 导入成绩，查看你的 Rating、最佳成绩与历史记录。" : t("landing.subheadline")}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="lg" className="rounded-full px-6" onClick={() => openAuthDialog()}>
              {t("auth.signIn")}
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-6" onClick={() => openAuthDialog({ mode: "signup" })}>
              {t("auth.createAccount")}
            </Button>
          </div>
          <div className="mt-8 grid max-w-md gap-3">
            <div className="grid grid-cols-2 gap-3">
              <ExploreCard
                href="/db"
                icon={<Database className="size-3" />}
                title={t("landing.links.db.title")}
                description={t("landing.links.db.description")}
              />
              <ExploreCard
                href="/profile/shedaniel/intl"
                icon={<UserRound className="size-3" />}
                title={t("landing.links.profile.title")}
                description={t("landing.links.profile.description")}
              />
            </div>
            <MinigameCards />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={getTransition({ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] })}
        >
          <Image
            src="/posts/2026-03-26-ui-refinement/dashboard-new.webp"
            alt={t("landing.screenshotAlt")}
            width={2862}
            height={1898}
            priority
            sizes="(min-width: 1200px) 700px, (min-width: 1024px) 58vw, 100vw"
            className="h-auto w-full"
          />
        </motion.div>
      </section>
    </div>
  );
}
