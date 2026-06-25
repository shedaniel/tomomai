"use client";

import { PostMeta } from "@/lib/posts";
import { AnimatedDialog, AnimatedDialogContent } from "@tomomai/ui";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tomomai/ui";
import { Button } from "@tomomai/ui";
import { Link } from "@/i18n/navigation"
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const CHANGELOG_STORAGE_KEY = "tomomai-changelog-last-seen";

interface ChangelogDialogProps {
  latestPost: PostMeta | null;
}

export function ChangelogDialog({ latestPost }: ChangelogDialogProps) {
  const t = useTranslations("db.posts.dialog");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!latestPost) return;

    const lastSeen = localStorage.getItem(CHANGELOG_STORAGE_KEY);
    // Use slug (includes date) as unique identifier instead of version
    if (lastSeen !== latestPost.slug) {
      setOpen(true);
    }
  }, [latestPost]);

  const handleDismiss = () => {
    if (latestPost) {
      // Store slug as the last seen post identifier
      localStorage.setItem(CHANGELOG_STORAGE_KEY, latestPost.slug);
    }
    setOpen(false);
  };

  if (!latestPost) return null;

  return (
    <AnimatedDialog open={open} onOpenChange={(o) => {
      if (!o) handleDismiss();
      else setOpen(true);
    }}>
      <AnimatedDialogContent className="sm:max-w-[420px]">
        <DialogHeader className="space-y-3 text-left">
          {latestPost.version && latestPost.version !== "N/A" && (
            <span className="inline-flex w-fit items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              v{latestPost.version}
            </span>
          )}
          <DialogTitle className="text-xl leading-snug">
            {latestPost.title}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {latestPost.summary}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-2 flex-row gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            {t("dismiss")}
          </Button>
          <Button size="sm" asChild onClick={handleDismiss}>
            <Link href={`/db/posts/${latestPost.slug}`}>
              {t("readMore")}
            </Link>
          </Button>
        </DialogFooter>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
