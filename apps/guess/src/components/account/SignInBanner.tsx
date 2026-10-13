"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { Button } from "@tomomai/ui";
import { BANNER_COOKIE } from "@/lib/banner";
import { useAccount } from "./AccountProvider";

/**
 * Guest-only nudge above the deck. Dismissal is a cookie rather than local
 * storage so the server can leave the banner out and the deck never shifts.
 */
export function SignInBanner({ snoozed }: { snoozed: boolean }) {
  const t = useTranslations("guess.account");
  const { enabled, viewer, signInHref } = useAccount();
  const [dismissed, setDismissed] = useState(snoozed);
  const visible = enabled && !viewer && !dismissed;

  const dismiss = () => {
    setDismissed(true);
    document.cookie = `${BANNER_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 overflow-hidden"
        >
          <div className="mt-2 flex items-center gap-3 rounded-lg border-2 border-border bg-card/60 py-2.5 pr-2 pl-4">
            <p className="flex-1 text-sm leading-snug text-pretty">
              <span className="font-medium">{t("bannerTitle")}</span>{" "}
              <span className="text-muted-foreground">{t("bannerBody")}</span>
            </p>
            <Button asChild size="sm" className="shrink-0">
              <a href={signInHref()}>{t("signIn")}</a>
            </Button>
            <button
              type="button"
              onClick={dismiss}
              aria-label={t("bannerDismiss")}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
