"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Sparkles, Headphones } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTransition } from "@/lib/animation-constants";

interface MinigameCardProps {
  href: string;
  domain: string;
  title: string;
  tagline: string;
  icon: React.ReactNode;
  glyph: string;
  accent: {
    surface: string;
    border: string;
    badge: string;
    title: string;
    subtitle: string;
    glyph: string;
    arrow: string;
  };
}

function MinigameCard({ href, domain, title, tagline, icon, glyph, accent }: MinigameCardProps) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative overflow-hidden rounded-lg border ${accent.border} ${accent.surface} px-3 py-2.5 transition-colors`}
      whileHover={{ y: -1, scale: 1.01 }}
      whileTap={{ scale: 0.995 }}
      transition={getTransition({ duration: 0.18 })}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-3 -bottom-6 select-none font-black leading-none tracking-tighter ${accent.glyph}`}
        style={{ fontSize: "5rem" }}
      >
        {glyph}
      </div>

      <div className="relative flex items-center gap-2">
        <div className={`inline-flex items-center justify-center rounded-md p-1 ${accent.badge}`}>
          {icon}
        </div>
        <p className={`text-sm font-semibold leading-tight ${accent.title}`}>{title}</p>
        <ArrowUpRight className={`ml-auto h-3.5 w-3.5 ${accent.arrow} group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform`} />
      </div>
      <p className={`relative mt-1 text-[11px] leading-snug text-balance ${accent.subtitle}`}>{tagline}</p>
    </motion.a>
  );
}

export function MinigameCards({ className = "grid-cols-2" }: { className?: string }) {
  const t = useTranslations("minigames");
  return (
    <div className={`grid gap-3 ${className}`}>
      <MinigameCard
        href="https://guesser.tomomai.lol"
        domain="guesser.tomomai.lol"
        title={t("guesser.title")}
        tagline={t("guesser.tagline")}
        glyph="?"
        icon={<Sparkles className="h-3 w-3" />}
        accent={{
          surface: "bg-muted/40 dark:bg-violet-950/15",
          border: "border-border/70 hover:border-violet-300/70 dark:hover:border-violet-800/70",
          badge: "bg-violet-100/70 text-violet-700/90 dark:bg-violet-900/40 dark:text-violet-300/90",
          title: "text-foreground",
          subtitle: "text-muted-foreground",
          glyph: "text-violet-300/40 dark:text-violet-100/[0.06]",
          arrow: "text-muted-foreground group-hover:text-violet-600 dark:group-hover:text-violet-300",
        }}
      />
      <MinigameCard
        href="https://heardle.tomomai.lol"
        domain="heardle.tomomai.lol"
        title={t("heardle.title")}
        tagline={t("heardle.tagline")}
        glyph="♪"
        icon={<Headphones className="h-3 w-3" />}
        accent={{
          surface: "bg-muted/40 dark:bg-rose-950/15",
          border: "border-border/70 hover:border-rose-300/70 dark:hover:border-rose-800/70",
          badge: "bg-rose-100/70 text-rose-700/90 dark:bg-rose-900/40 dark:text-rose-300/90",
          title: "text-foreground",
          subtitle: "text-muted-foreground",
          glyph: "text-rose-300/40 dark:text-rose-100/[0.06]",
          arrow: "text-muted-foreground group-hover:text-rose-600 dark:group-hover:text-rose-300",
        }}
      />
    </div>
  );
}
