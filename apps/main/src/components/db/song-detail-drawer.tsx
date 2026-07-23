"use client";

import { Button } from "@tomomai/ui";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@tomomai/ui";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";

interface SongDetailDrawerProps {
  /** The @detail parallel-route slot content (server-rendered SongDetailContent for /db/songs/[slug], else null). */
  children: ReactNode;
}

/**
 * Always-mounted drawer that wraps the @detail parallel-route slot.
 *
 * Mounted at /db/layout.tsx as a sibling of <DbLayoutClient/> so it sits
 * outside the AnimatePresence/motion.div containing-block trap. Uses
 * `inline` DrawerContent (no portal) so the drawer's DOM lives at the
 * same JSX position on server and client — SSR HTML contains the song
 * detail for crawlers and JS-off clients.
 *
 * Open state is derived from `useSelectedLayoutSegments('detail')`:
 * - segments.length < 2  → no [slug] match → drawer closed
 * - segments.length >= 2 → on /db/[type]/[slug] → drawer open
 *
 * Close paths (X button, snap-to-0, drawer dismiss) all push back to
 * /db/{type}, letting the slot resolve to default.tsx (null).
 */
export function SongDetailDrawer({ children }: SongDetailDrawerProps) {
  const router = useRouter();
  const t = useTranslations();
  // Drive open state from pathname rather than `useSelectedLayoutSegments`:
  // parallel-route slots can stay stuck on their previous match during soft
  // navigation back to a slot-unmatched URL, leaving the segments stale.
  // Pathname always reflects the live URL, which matches what the user sees.
  const pathname = usePathname();
  const slugMatch = pathname?.match(/^\/db\/(songs)\/([^/]+)\/?$/);
  const type = slugMatch?.[1] ?? null;
  const isOpen = !!slugMatch;

  const [snap, setSnap] = useState<number | string | null>(0.6);

  // Hold onto the last non-empty slot content so the close animation has
  // something to render after the URL flips back to /db/{type}.
  const [lastChildren, setLastChildren] = useState<ReactNode>(children);
  useEffect(() => {
    if (isOpen) setLastChildren(children);
  }, [isOpen, children]);

  // Snap back to the half position whenever a new slug opens.
  useEffect(() => {
    if (isOpen) setSnap(0.6);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (!type) return;
    router.push(`/db/${type}`, { scroll: false });
  }, [router, type]);

  const handleSnapChange = useCallback(
    (s: number | string | null) => {
      if (s === 0) handleClose();
      setSnap(s);
    },
    [handleClose]
  );

  const displayed = isOpen ? children : lastChildren;
  const closeHref = type ? `/db/${type}` : "/db";

  return (
    <Drawer
      snapPoints={[0, 0.6, 1]}
      activeSnapPoint={snap}
      setActiveSnapPoint={handleSnapChange}
      fadeFromIndex={2}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      dismissible
    >
      <DrawerContent
        inline
        className="bg-background mx-auto w-[calc(min(100dvw-1rem,42rem))] max-h-[90dvh] h-dvh shadow-2xl"
      >
        <VisuallyHidden>
          <DrawerTitle>{t("db.songs.detail.title")}</DrawerTitle>
          <DrawerDescription>{t("db.songs.detail.artist")}</DrawerDescription>
        </VisuallyHidden>
        <div
          className={cn(
            "relative px-6 pt-4",
            snap === 1 ? "overflow-y-auto" : "overflow-hidden"
          )}
          style={{ scrollbarGutter: "stable" }}
          onWheel={(e) => {
            if (snap !== 1 && e.deltaY > 0) {
              setSnap(1);
              e.preventDefault();
            }
          }}
        >
          <div className="absolute top-2 right-3 z-20">
            <Link
              href={closeHref}
              aria-label={t("common.close")}
              scroll={false}
              prefetch={false}
              onClick={(e) => {
                // JS-on: soft close via router.push. JS-off: native nav.
                e.preventDefault();
                handleClose();
              }}
            >
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full"
                asChild
              >
                <span>
                  <X className="h-4 w-4 text-neutral-400 stroke-3" />
                </span>
              </Button>
            </Link>
          </div>
          {displayed}
          <div className="h-8" />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
