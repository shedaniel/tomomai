"use client";

import { useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { PolicyDialog } from "@/components/policy-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@tomomai/ui";
import { TRANSLATION_STATS } from "@/lib/i18n/translation-stats";
import { getLanguages, cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const [showTos, setShowTos] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const t = useTranslations();

  const { data: policies } = trpc.user.getPolicies.useQuery(undefined, {
    enabled: open,
  });

  const languages = getLanguages(t)
    .filter((l) => l.value !== null && TRANSLATION_STATS[l.value])
    .map((l) => ({ ...l, stats: TRANSLATION_STATS[l.value as string] }))
    .sort((a, b) => b.stats.percent - a.stats.percent);

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>About ともマイ</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            A modern web application for tracking and analyzing your maimai DX scores with friends.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">Disclaimer</h3>
            <p className="text-sm">
              This is an <strong>unofficial project</strong> and is not affiliated with, endorsed by, or connected to SEGA Corporation or any of its subsidiaries. maimai DX is a trademark of SEGA Corporation.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-3">Acknowledgments</h3>
            <div className="space-y-2 text-sm">
              <p><strong>SEGA</strong> for creating maimai DX</p>
              <p><strong><a href="https://github.com/gekichumai/dxrating" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">dxrating</a></strong> for providing internal level data</p>
              <p><strong><a href="https://github.com/zvuc/otoge-db" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">otoge-db</a></strong> for providing level data</p>
              <p><strong><a href="https://maimai.lxns.net/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">落雪咖啡屋</a></strong> for providing song and chart data for the China region</p>
              <p>Flag artwork from <strong><a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">Twemoji</a></strong> by Twitter, Inc. and contributors, licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">CC-BY 4.0</a></p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">License & Source Code</h3>
            <div className="space-y-2 text-sm">
              <p>
                This project is licensed under the <strong>GNU Affero General Public License v3.0 (AGPL-3.0)</strong>.
                <br />
                TL;DR: You are free to use, modify, and distribute the code, but you must provide the source code for any modifications.
              </p>
              <p>Source code is available on GitHub:</p>
              <a
                href="https://github.com/shedaniel/tomomai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block hover:underline font-mono text-xs bg-muted px-3 py-2 rounded"
              >
                https://github.com/shedaniel/tomomai
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Translations</h3>
            <TooltipProvider delayDuration={150}>
              <div className="rounded-lg border divide-y">
                {languages.map((language) => {
                  const { translated, missing, percent } = language.stats;
                  const colorClass =
                    percent >= 100
                      ? "text-green-500"
                      : percent >= 80
                        ? "text-lime-500"
                        : percent >= 50
                          ? "text-yellow-500"
                          : "text-orange-500";
                  return (
                    <div
                      key={language.value as string}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span>{language.label}</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={cn("font-medium tabular-nums cursor-help", colorClass)}>
                            {percent}%
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {translated} translated, {missing} missing
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Legal</h3>
            <div className="space-y-2 text-sm">
              <button
                onClick={() => setShowTos(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                disabled={!policies}
              >
                Terms of Service
              </button>
              <br />
              <button
                onClick={() => setShowPrivacy(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                disabled={!policies}
              >
                Privacy Policy
              </button>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-center text-sm text-muted-foreground">
              Built with ❤️ for the maimai community
            </p>
          </div>
        </div>
      </ResponsiveDialogContent>

      {/* Policy dialogs */}
      {policies && (
        <>
          <PolicyDialog
            open={showTos}
            onOpenChange={setShowTos}
            title="Terms of Service"
            content={policies.tos.content}
          />
          <PolicyDialog
            open={showPrivacy}
            onOpenChange={setShowPrivacy}
            title="Privacy Policy"
            content={policies.privacy.content}
          />
        </>
      )}
    </ResponsiveDialog>
  );
}
