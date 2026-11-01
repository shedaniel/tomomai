"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { useGame } from "@/components/providers/game-provider";
import type { SearchSourcesProps } from "@/components/games/registry";
import type { PaletteItem } from "@/components/command-palette/types";
import { supportsGameFeature } from "@/lib/games/frontend";
import { trpc } from "@/lib/trpc-client";

/** maimai's events for the command palette, each opening the events database at that event. */
export function MaimaiSearchSources({ enabled, onItems }: SearchSourcesProps) {
  const game = useGame();
  const t = useTranslations("commandPalette");
  const offersEvents = supportsGameFeature(game, "events");
  const { data: events } = trpc.maimai.getEvents.useQuery(undefined, {
    enabled: enabled && offersEvents,
    staleTime: 3600000,
    refetchOnWindowFocus: false,
  });

  const items = useMemo<PaletteItem[]>(() => (events ?? []).map(event => ({
    id: `event:${event.name}`,
    group: "events",
    title: event.name,
    subtitle: t("groups.events"),
    icon: CalendarDays,
    href: `/db/events?event=${encodeURIComponent(event.name)}`,
    remember: true,
    searchOnly: true,
  })), [events, t]);

  useEffect(() => onItems(items), [items, onItems]);
  return null;
}
