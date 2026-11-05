"use client";

import { DiscordIcon } from "@tomomai/ui";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { getTransition } from "@/lib/animation-constants";

export function DiscordBanner({ inviteUrl, onDismiss }: { inviteUrl: string; onDismiss: () => void }) {
  const t = useTranslations();

  return (
    <motion.div
      className="mb-6 relative bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4"
      initial={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
    >
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <DiscordIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
            {t('publicHeader.discordBanner')}
          </p>
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
          >
            <span>Discord</span>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </motion.div>
  )
}
