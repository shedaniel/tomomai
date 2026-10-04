"use client";

import { useEffect } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { ArrowRight, ArrowUpRight, ChartColumnBig, Database, History, Sparkles, UserRound } from "lucide-react";
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

const FEATURES = [
  { key: "rating", icon: ChartColumnBig },
  { key: "recommendations", icon: Sparkles },
  { key: "history", icon: History },
] as const;

function ExploreLink({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/70"
    >
      <div className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary-container p-1.5 text-on-primary-container">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{description}</p>
      </div>
      <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function LandingPage({ signInOptions }: LandingPageProps) {
  const t = useTranslations("landing");
  const ta = useTranslations("auth");
  const utils = trpc.useUtils();
  const { openAuthDialog } = useAuthDialog();
  const cnMode = isCNExclusive();

  useEffect(() => {
    utils.user.getSignInOptions.setData(undefined, signInOptions);
  }, [utils, signInOptions]);

  // Better Auth's OAuth provider sends signed-out visitors here (loginPage: "/")
  // with a signed query that sign-in must be started from.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("sig")) return;
    openAuthDialog({ mode: params.get("prompt") === "create" ? "signup" : "signin" });
  }, [openAuthDialog]);

  return (
    <div className="container mx-auto max-w-[1200px] px-4 pt-8 pb-16">
      <Header currentTab="dashboard" showDiscordBanner={false} />

      <section className="grid items-center gap-10 pt-2 md:pt-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={getTransition({ duration: 0.5, ease: [0.4, 0, 0.2, 1] })}
        >
          <p className="mb-4 inline-flex items-center rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("eyebrow")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance md:text-5xl">{t("headline")}</h1>
          <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground md:text-lg">
            {cnMode ? "从舞萌 DX 导入成绩，看清 Rating 的构成，找到下一首值得打的谱面。" : t("subheadline")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" className="rounded-full px-6" onClick={() => openAuthDialog({ mode: "signup" })}>
              {t("getStarted")}
              <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" className="rounded-full px-6" onClick={() => openAuthDialog()}>
              {ta("signIn")}
            </Button>
          </div>
        </motion.div>

        <motion.div
          className="relative"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={getTransition({ duration: 0.6, delay: 0.1, ease: [0.4, 0, 0.2, 1] })}
        >
          <div aria-hidden className="absolute inset-8 -z-10 rounded-[3rem] bg-primary/25 blur-3xl" />
          <Image
            src="/posts/2026-03-26-ui-refinement/dashboard-new.webp"
            alt={t("screenshotAlt")}
            width={2862}
            height={1898}
            priority
            sizes="(min-width: 1200px) 700px, (min-width: 1024px) 58vw, 100vw"
            className="h-auto w-full"
          />
        </motion.div>
      </section>

      <section className="mt-16 grid gap-8 sm:grid-cols-3 md:mt-24">
        {FEATURES.map(({ key, icon: Icon }) => (
          <div key={key}>
            <div className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon className="size-4.5" />
            </div>
            <h2 className="font-semibold">{t(`features.${key}.title`)}</h2>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">{t(`features.${key}.description`)}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 md:mt-24">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t("explore.title")}</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <ExploreLink
              href="/db"
              icon={<Database className="size-3.5" />}
              title={t("explore.db.title")}
              description={t("explore.db.description")}
            />
            <ExploreLink
              href="/profile/shedaniel/intl"
              icon={<UserRound className="size-3.5" />}
              title={t("explore.profile.title")}
              description={t("explore.profile.description")}
            />
          </div>
          <MinigameCards />
        </div>
      </section>
    </div>
  );
}
