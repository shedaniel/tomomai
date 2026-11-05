"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays, Headphones, Sparkles } from "lucide-react";
import { useGame } from "@/components/providers/game-provider";
import type { SearchSourcesProps } from "@/components/games/registry";
import type { PaletteItem } from "@/components/command-palette/types";
import { supportsGameFeature } from "@/lib/games/frontend";
import { trpc } from "@/lib/trpc-client";
import { GUESSER_URL, HEARDLE_URL } from "./minigame-cards";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** maimai's events, each opening the events database at that event, and the guesser and heardle minigames. */
export function MaimaiSearchSources({ enabled, onItems }: SearchSourcesProps) {
  const game = useGame();
  const t = useTranslations("commandPalette");
  const tMinigames = useTranslations("minigames");
  const offersMinigames = supportsGameFeature(game, "minigames");
  const offersEvents = supportsGameFeature(game, "events");
  const { data: events } = trpc.maimai.getEvents.useQuery(undefined, {
    enabled: enabled && offersEvents,
    staleTime: 3600000,
    refetchOnWindowFocus: false,
  });

  const items = useMemo<PaletteItem[]>(() => [
    ...(offersMinigames ? [
      {
        id: "minigame:guesser",
        group: "minigames" as const,
        title: tMinigames("guesser.title"),
        subtitle: tMinigames("guesser.tagline"),
        icon: Sparkles,
        keywords: ["guesser", "guess", "quiz", "game", "minigame"],
        perform: () => openExternal(GUESSER_URL),
      },
      {
        id: "minigame:heardle",
        group: "minigames" as const,
        title: tMinigames("heardle.title"),
        subtitle: tMinigames("heardle.tagline"),
        icon: Headphones,
        keywords: ["heardle", "listen", "audio", "quiz", "game", "minigame"],
        perform: () => openExternal(HEARDLE_URL),
      },
    ] : []),
    ...(events ?? []).map(event => ({
      id: `event:${event.name}`,
      group: "events" as const,
      title: event.name,
      subtitle: t("groups.events"),
      icon: CalendarDays,
      href: `/db/events?event=${encodeURIComponent(event.name)}`,
      remember: true,
      searchOnly: true,
    })),
  ], [events, t, tMinigames, offersMinigames]);

  useEffect(() => onItems(items), [items, onItems]);
  return null;
}
