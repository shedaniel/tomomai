"use client";

import { CoverImage } from "@/components/cover-image";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { cn } from "@/lib/utils";
import type { CreditSummary } from "@/server/services/credit-data";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  Skeleton,
} from "@tomomai/ui";
import { ChevronDown, Loader2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

const DIFFICULTY_RING: Record<string, string> = {
  basic: "ring-green-400",
  advanced: "ring-yellow-400",
  expert: "ring-red-400",
  master: "ring-purple-500",
  remaster: "ring-purple-200",
  utage: "ring-pink-400",
};

export interface CreditPickerProps {
  credits: CreditSummary[];
  /** The credit shown when nothing was picked explicitly. */
  selected: CreditSummary | null;
  selectedAt: number | null;
  isLoading: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onSelect: (credit: CreditSummary) => void;
}

function CreditCovers({ credit }: { credit: CreditSummary }) {
  return (
    <div className="flex items-center gap-2.5">
      {credit.tracks.map((track) => (
        <CoverImage
          key={track.track}
          coverUrl={track.cover}
          alt={track.songName}
          width={32}
          height={32}
          loading="lazy"
          className={cn(
            "h-8 w-8 shrink-0 rounded ring-2 ring-offset-2 ring-offset-background",
            DIFFICULTY_RING[track.difficulty],
          )}
        />
      ))}
    </div>
  );
}

function useCreditDate() {
  const format = useFormatter();
  return useMemo(() => ({
    day: (at: number) => format.dateTime(new Date(at * 1000), { year: "numeric", month: "short", day: "numeric", weekday: "short" }),
    time: (at: number) => format.dateTime(new Date(at * 1000), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  }), [format]);
}

function CreditList({ credits, selectedAt, isLoading, hasMore, isFetchingMore, onLoadMore, onSelect, className, headerClassName = "bg-background/90" }: Omit<CreditPickerProps, "selected"> & {
  className?: string;
  headerClassName?: string;
}) {
  const t = useTranslations("dataContent.exportImageCard");
  const date = useCreditDate();
  const sentinelRef = useInfiniteScroll(onLoadMore, hasMore && !isFetchingMore);

  const days = useMemo(() => {
    const groups: { day: string; credits: CreditSummary[] }[] = [];
    for (const credit of credits) {
      const day = date.day(credit.at);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.credits.push(credit);
      else groups.push({ day, credits: [credit] });
    }
    return groups;
  }, [credits, date]);

  if (isLoading) {
    return (
      <div className={cn("space-y-1 p-1", className)}>
        <Skeleton className="mx-2 my-2 h-3 w-24" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2.5">
            <Skeleton className="h-3 w-10" />
            <div className="flex gap-2.5">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-8 w-8 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (credits.length === 0) {
    return <div className={cn("py-8 text-center text-sm text-muted-foreground", className)}>{t("noCredits")}</div>;
  }

  return (
    <div className={cn("overflow-y-auto overscroll-contain", className)}>
      {days.map((group) => (
        <div key={group.day}>
          <div className={cn("sticky top-0 z-10 px-3 pb-1 pt-3 text-xs font-medium text-muted-foreground backdrop-blur-sm", headerClassName)}>
            {group.day}
          </div>
          <div className="space-y-0.5 px-1">
            {group.credits.map((credit) => (
              <button
                key={credit.at}
                type="button"
                onClick={() => onSelect(credit)}
                aria-current={credit.at === selectedAt || undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
                  credit.at === selectedAt ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
              >
                <span className="w-11 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{date.time(credit.at)}</span>
                <CreditCovers credit={credit} />
              </button>
            ))}
          </div>
        </div>
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

/** Sits beside the image on wide screens. */
export function CreditSidebar(props: CreditPickerProps) {
  const t = useTranslations("dataContent.exportImageCard");
  return (
    <div className="flex max-h-[min(80vh,44rem)] flex-col rounded-xl border">
      <div className="border-b px-3 py-2.5 text-sm font-medium">{t("chooseCredit")}</div>
      <CreditList {...props} className="min-h-0 flex-1 pb-1" />
    </div>
  );
}

/** Opens the same list in a bottom sheet on narrow screens. */
export function CreditDrawerPicker(props: CreditPickerProps) {
  const t = useTranslations("dataContent.exportImageCard");
  const date = useCreditDate();
  const [open, setOpen] = useState(false);
  const { selected } = props;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          disabled={props.isLoading || !selected}
          className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
        >
          {selected ? (
            <>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="truncate text-xs text-muted-foreground">
                  {date.day(selected.at)} · {date.time(selected.at)}
                </div>
                <div className="pl-0.5">
                  <CreditCovers credit={selected} />
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          ) : (
            <span className="py-1 text-sm text-muted-foreground">
              {props.isLoading ? t("creditLoading") : t("noCredits")}
            </span>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{t("chooseCredit")}</DrawerTitle>
          <DrawerDescription className="sr-only">{t("chooseCredit")}</DrawerDescription>
        </DrawerHeader>
        <CreditList
          {...props}
          className="min-h-0 flex-1 pb-8"
          // The sheet is glass, so a solid header would read as a band
          headerClassName="bg-transparent backdrop-blur-md"
          onSelect={(credit) => {
            props.onSelect(credit);
            setOpen(false);
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}
