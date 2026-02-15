"use client";

import { PostMeta } from "@/lib/posts";
import { AnimatedDialog, AnimatedDialogContent } from "@/components/ui/animated-dialog";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

const CHANGELOG_STORAGE_KEY = "tomomai-changelog-last-seen";

interface ChangelogDialogProps {
  latestPost: PostMeta | null;
}

export function ChangelogDialog({ latestPost }: ChangelogDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!latestPost) return;

    const lastSeen = localStorage.getItem(CHANGELOG_STORAGE_KEY);
    if (lastSeen !== latestPost.version) {
      setOpen(true);
    }
  }, [latestPost]);

  const handleDismiss = () => {
    if (latestPost) {
      localStorage.setItem(CHANGELOG_STORAGE_KEY, latestPost.version);
    }
    setOpen(false);
  };

  if (!latestPost) return null;

  return (
    <AnimatedDialog open={open} onOpenChange={(o) => {
      if (!o) handleDismiss();
      else setOpen(true);
    }}>
      <AnimatedDialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {latestPost.title}
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              v{latestPost.version}
            </span>
          </DialogTitle>
          <DialogDescription>
            {latestPost.summary}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex-row gap-2 sm:justify-between">
          <Button variant="outline" onClick={handleDismiss}>
            Dismiss
          </Button>
          <Button asChild onClick={handleDismiss}>
            <Link href={`/db/posts/${latestPost.slug}`}>
              Read More
            </Link>
          </Button>
        </DialogFooter>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
