"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CornerDownLeft, History, Music, Search, X } from "lucide-react";
import { createSearchIndex, parseSearchQuery, searchIndex, type SearchField } from "@tomomai/utils/search";
import {
  AnimatedDialog, AnimatedDialogContent, Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
  DialogDescription, DialogTitle, Drawer, DrawerContent, DrawerDescription, DrawerTitle, Kbd,
} from "@tomomai/ui";
import { useRouter } from "@/i18n/navigation";
import { useGame } from "@/components/providers/game-provider";
import { CoverImage } from "@/components/cover-image";
import { ChartTypeBadge } from "@/components/games/chart-type-badge";
import { ThemeDialog } from "@/components/theme-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { codeOf } from "@/lib/games/codes";
import { getGameDifficulty } from "@/lib/games/presentation";
import { getVersion } from "@/lib/games/versions";
import { trpc } from "@/lib/trpc-client";
import { catalogSongFields } from "@/lib/search/song-search";
import { cn } from "@/lib/utils";
import type { UniqueSong } from "@/components/db/songs/types";
import { useCommandPalette } from "./command-palette-provider";
import { clearRecents, readRecents, rememberRecent } from "./recents";
import { useActionItems, usePageItems } from "./sources";
import type { PaletteGroup, PaletteItem, RecentItem } from "./types";

const SONG_RESULTS = 8;
const ITEM_FIELDS: SearchField<PaletteItem>[] = [
  { get: item => item.title, weight: 3 },
  { get: item => item.keywords, weight: 2 },
  { get: item => item.subtitle },
];

type Section = { group: PaletteGroup; items: PaletteItem[] };

function songItem(song: UniqueSong): PaletteItem {
  return {
    id: `song:${song.slug}`,
    group: "songs",
    title: song.songName,
    subtitle: song.artist,
    cover: song.cover,
    href: `/db/songs/${encodeURIComponent(song.slug)}`,
    song,
    remember: true,
  };
}

function recentItem(recent: RecentItem): PaletteItem {
  return {
    id: `recent:${recent.id}`,
    group: "recent",
    title: recent.title,
    subtitle: recent.subtitle,
    cover: recent.cover,
    icon: recent.kind === "song" ? Music : History,
    href: recent.href,
  };
}

function isMacPlatform(): boolean {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** The ⌘K / Ctrl+K label for this platform. */
export function useShortcutLabel(): string[] {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(isMacPlatform()), []);
  return mac ? ["⌘", "K"] : ["Ctrl", "K"];
}

export function CommandPalette() {
  const { open, setOpen, contextualActions } = useCommandPalette();
  const t = useTranslations("commandPalette");
  const game = useGame();
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 768px)", { initializeWithValue: false });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [themeOpen, setThemeOpen] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    if (open) setRecents(readRecents(game.id));
    else setQuery("");
  }, [open, game.id]);

  const { data: catalog, isLoading: catalogLoading } = trpc.user.getAllUniqueSongs.useQuery({ game: game.id }, {
    enabled: open,
    staleTime: 3600000,
    refetchOnWindowFocus: false,
  });

  const openTheme = useCallback(() => setThemeOpen(true), []);
  const pages = usePageItems();
  const actions = useActionItems({ openTheme });
  const songFields = useMemo(() => catalogSongFields(game.id), [game.id]);
  const songIndex = useMemo(() => catalog ? createSearchIndex(catalog, songFields) : null, [catalog, songFields]);

  const { sections, songMatchCount } = useMemo((): { sections: Section[]; songMatchCount: number } => {
    const tokens = parseSearchQuery(query);
    const allActions = [...contextualActions, ...actions];
    if (tokens.length === 0) {
      return {
        songMatchCount: 0,
        sections: [
          { group: "recent", items: recents.map(recentItem) },
          { group: "actions", items: allActions.filter(item => !item.searchOnly).slice(0, 5) },
          { group: "pages", items: pages.slice(0, 8) },
        ].filter(section => section.items.length > 0) as Section[],
      };
    }

    const songHits = songIndex ? searchIndex(songIndex, tokens) : [];
    const pageHits = searchIndex(createSearchIndex(pages, ITEM_FIELDS), tokens);
    const actionHits = searchIndex(createSearchIndex(allActions, ITEM_FIELDS), tokens);
    // The group with the best match leads, so "settings" puts pages first and a song title puts songs first.
    const ranked = [
      { group: "songs" as const, hits: songHits.slice(0, SONG_RESULTS), items: songHits.slice(0, SONG_RESULTS).map(hit => songItem(hit.item)) },
      { group: "pages" as const, hits: pageHits, items: pageHits.map(hit => hit.item) },
      { group: "actions" as const, hits: actionHits, items: actionHits.map(hit => hit.item) },
    ]
      .filter(section => section.items.length > 0)
      .sort((a, b) => (b.hits[0]?.score ?? 0) - (a.hits[0]?.score ?? 0));
    return { songMatchCount: songHits.length, sections: ranked.map(({ group, items }) => ({ group, items })) };
  }, [query, songIndex, pages, actions, contextualActions, recents]);

  const allItems = useMemo(() => sections.flatMap(section => section.items), [sections]);
  const selectedItem = allItems.find(item => item.id === selected) ?? allItems[0];

  const run = useCallback((item: PaletteItem) => {
    setOpen(false);
    if (item.remember && item.href) {
      setRecents(rememberRecent(game.id, {
        id: item.id,
        kind: item.song ? "song" : "page",
        title: item.title,
        subtitle: item.subtitle,
        cover: item.cover,
        href: item.href,
      }));
    }
    if (item.perform) item.perform();
    else if (item.href) router.push(item.href);
  }, [setOpen, game.id, router]);

  const showAll = songMatchCount > SONG_RESULTS && query.trim()
    ? { href: `/db/songs?q=${encodeURIComponent(query.trim())}`, count: songMatchCount }
    : null;

  const body = (
    <Command shouldFilter={false} value={selectedItem?.id ?? ""} onValueChange={setSelected} loop className="min-h-0">
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t("placeholder", { game: game.brand.displayName })}
        autoFocus
      >
        {query ? (
          <button type="button" onClick={() => setQuery("")} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t("clear")}>
            <X className="size-4" />
          </button>
        ) : !isMobile && <Kbd>esc</Kbd>}
      </CommandInput>
      <div className="flex min-h-0 flex-1">
        <CommandList className={cn("min-h-0 flex-1 py-1", isMobile ? "max-h-none" : "max-h-[min(60vh,28rem)]")}>
          <CommandEmpty>
            {catalogLoading && query ? t("loadingCatalog") : t("empty", { query })}
          </CommandEmpty>
          {sections.map(section => (
            <CommandGroup key={section.group} heading={(
              <span className="flex items-center justify-between">
                {t(`groups.${section.group}`)}
                {section.group === "recent" && (
                  <button
                    type="button"
                    className="text-[11px] font-normal text-muted-foreground hover:text-foreground"
                    onClick={() => { clearRecents(game.id); setRecents([]); }}
                  >
                    {t("clearRecent")}
                  </button>
                )}
              </span>
            )}>
              {section.items.map(item => <PaletteRow key={item.id} item={item} onSelect={() => run(item)} />)}
              {section.group === "songs" && showAll && (
                <CommandItem value="show-all-songs" onSelect={() => run({ id: "show-all-songs", group: "songs", title: "", href: showAll.href })} className="text-muted-foreground">
                  <Search />
                  <span className="flex-1">{t("showAllSongs", { count: showAll.count })}</span>
                  <ArrowRight />
                </CommandItem>
              )}
            </CommandGroup>
          ))}
        </CommandList>
        {!isMobile && selectedItem && <Preview item={selectedItem} />}
      </div>
      {!isMobile && (
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border/60 px-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t("hints.navigate")}</span>
          <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" /></Kbd>{t("hints.open")}</span>
          <span className="flex items-center gap-1.5"><Kbd>esc</Kbd>{t("hints.close")}</span>
        </div>
      )}
    </Command>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="h-[92dvh]">
            <DrawerTitle className="sr-only">{t("title")}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("description")}</DrawerDescription>
            <div className="flex min-h-0 flex-1 flex-col pt-2">{body}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <AnimatedDialog open={open} onOpenChange={setOpen}>
          <AnimatedDialogContent showCloseButton={false} className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
            <DialogTitle className="sr-only">{t("title")}</DialogTitle>
            <DialogDescription className="sr-only">{t("description")}</DialogDescription>
            {body}
          </AnimatedDialogContent>
        </AnimatedDialog>
      )}
      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
    </>
  );
}

function PaletteRow({ item, onSelect }: { item: PaletteItem; onSelect: () => void }) {
  const game = useGame().id;
  const Icon = item.icon;
  return (
    <CommandItem value={item.id} onSelect={onSelect} className="min-h-11">
      {item.cover ? (
        <CoverImage coverUrl={item.cover} alt="" width={36} height={36} loading="lazy" className="size-9 shrink-0 rounded-md object-cover" />
      ) : Icon ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/70 text-muted-foreground"><Icon /></span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{item.title}</span>
        {item.subtitle && <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>}
      </span>
      {item.song && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex">
          <ChartTypeBadge typeCode={codeOf(game, "chartType", item.song.type)} size="xs" />
          {item.song.difficulties.slice(-2).map(chart => {
            const difficulty = getGameDifficulty(game, codeOf(game, "difficulty", chart.difficulty));
            return (
              <span key={chart.difficulty} className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums", difficulty.classes.chip)}>
                {chart.level}
              </span>
            );
          })}
        </span>
      )}
    </CommandItem>
  );
}

function Preview({ item }: { item: PaletteItem }) {
  const t = useTranslations("commandPalette");
  const game = useGame().id;
  const Icon = item.icon;
  const song = item.song;
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border/60 p-4 md:flex" aria-live="polite">
      {song ? (
        <>
          <CoverImage coverUrl={song.cover} alt={song.songName} width={240} height={240} className="aspect-square w-full rounded-lg object-cover shadow-sm" />
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug">{song.songName}</h3>
              <ChartTypeBadge typeCode={codeOf(game, "chartType", song.type)} size="sm" />
            </div>
            <p className="text-sm text-muted-foreground">{song.artist}</p>
            <p className="text-xs text-muted-foreground">{[song.genre, getVersion(game, song.addedVersion)?.name].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="grid gap-1.5">
            {song.difficulties.map(chart => {
              const difficulty = getGameDifficulty(game, codeOf(game, "difficulty", chart.difficulty));
              return (
                <div key={chart.difficulty} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-20 shrink-0 truncate text-xs font-semibold", difficulty.classes.text)}>{difficulty.label}</span>
                  <span className="font-semibold tabular-nums">{chart.level}</span>
                  {chart.levelPrecise > 0 && <span className="text-xs tabular-nums text-muted-foreground">{(chart.levelPrecise / 10).toFixed(1)}</span>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {Icon && <span className="grid size-14 place-items-center rounded-2xl bg-muted/70 text-muted-foreground"><Icon className="size-7" /></span>}
          <div className="space-y-1">
            <p className="font-medium">{item.title}</p>
            {item.subtitle && <p className="text-sm text-muted-foreground">{item.subtitle}</p>}
          </div>
          <p className="text-xs text-muted-foreground">{item.href ? t("hints.openPage") : t("hints.runAction")}</p>
        </div>
      )}
    </aside>
  );
}
