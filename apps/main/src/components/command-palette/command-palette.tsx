"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, AtSign, BookOpen, Code, CornerDownLeft, FileText, History, Link2, Music, Search, User, X } from "lucide-react";
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
import { formatGameRating, formatGameScore, getGameDifficulty, getGrade } from "@/lib/games/presentation";
import { supportsGameFeature } from "@/lib/games/frontend";
import { GAME_UI } from "@/components/games/registry";
import { useLocale } from "@tomomai/i18n/client";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { resolveBaseUrl } from "@/lib/base-url";
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
    icon: recent.kind === "song" ? Music : recent.kind === "player" ? User : History,
    href: recent.href,
  };
}

/** `@name` searches players only and `>name` actions only. */
function parseScope(query: string): { scope: "all" | "players" | "actions"; text: string } {
  if (query.startsWith("@")) return { scope: "players", text: query.slice(1) };
  if (query.startsWith(">")) return { scope: "actions", text: query.slice(1) };
  return { scope: "all", text: query };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
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
  const { locale } = useLocale();
  const { data: documents } = trpc.user.getSearchDocuments.useQuery({ game: game.id, locale }, {
    enabled: open,
    staleTime: 3600000,
    refetchOnWindowFocus: false,
  });
  const { data: session } = useSession();
  const { data: userData } = trpc.user.getUserData.useQuery(undefined, { enabled: open && !!session?.user, staleTime: 60000 });

  const { scope, text: scopedQuery } = parseScope(query.trimStart());
  const playerQuery = useDebouncedValue(scopedQuery.trim(), 150);
  const searchesPlayers = open && scope !== "actions" && playerQuery.length >= 2 && supportsGameFeature(game, "scores");
  const { data: players, isFetching: playersLoading } = trpc.user.searchPlayers.useQuery({ game: game.id, query: playerQuery }, {
    enabled: searchesPlayers,
    staleTime: 30000,
    placeholderData: previous => previous,
    retry: false,
  });

  const [gameItems, setGameItems] = useState<PaletteItem[]>([]);
  const GameSearchSources = GAME_UI[game.id].SearchSources;

  const openTheme = useCallback(() => setThemeOpen(true), []);
  const basePages = usePageItems();
  const baseActions = useActionItems({ openTheme });
  const username = userData?.username ?? null;
  const pages = useMemo<PaletteItem[]>(() => username
    ? [{ id: "page:my-profile", group: "pages", title: t("pages.myProfile"), subtitle: `@${username}`, icon: User, href: `/profile/${username}`, keywords: ["profile", "me", username], remember: true }, ...basePages]
    : basePages, [basePages, username, t]);
  const actions = useMemo<PaletteItem[]>(() => username && userData?.publishProfile
    ? [...baseActions, {
      id: "action:copy-profile",
      group: "actions",
      title: t("actions.copyProfileLink"),
      icon: Link2,
      keywords: ["share", "profile", "link", "url"],
      perform: () => {
        void navigator.clipboard.writeText(`${resolveBaseUrl()}/${locale}/profile/${username}`)
          .then(() => toast.success(t("actions.copiedProfileLink")), () => undefined);
      },
    }]
    : baseActions, [baseActions, username, userData?.publishProfile, locale, t]);

  const documentItems = useMemo<PaletteItem[]>(() => documents ? [
    ...documents.posts.map(post => ({ id: `post:${post.href}`, group: "posts" as const, title: post.title, subtitle: [post.date, post.summary].filter(Boolean).join(" · "), icon: FileText, href: post.href, remember: true, searchOnly: true })),
    ...documents.guides.map(guide => ({ id: `doc:${guide.href}`, group: "docs" as const, title: guide.title, subtitle: guide.summary ?? undefined, icon: BookOpen, href: guide.href, remember: true, searchOnly: true })),
    ...documents.endpoints.map(endpoint => ({ id: `doc:${endpoint.href}`, group: "docs" as const, title: endpoint.title, subtitle: endpoint.summary, icon: Code, href: endpoint.href, keywords: ["endpoint"], remember: true, searchOnly: true })),
  ] : [], [documents]);

  const playerItems = useMemo<PaletteItem[]>(() => (searchesPlayers ? players ?? [] : []).map(player => ({
    id: `player:${player.username}`,
    group: "players",
    title: player.displayName ?? player.username,
    subtitle: [`@${player.username}`, player.rating !== null ? formatGameRating(game.id, player.rating) : null].filter(Boolean).join(" · "),
    cover: player.iconUrl ?? undefined,
    icon: AtSign,
    href: `/profile/${player.username}`,
    keywords: [player.username],
    player: { username: player.username, displayName: player.displayName, rating: player.rating, image: player.iconUrl ?? player.image },
    remember: true,
  })), [players, searchesPlayers, game.id]);

  const songFields = useMemo(() => catalogSongFields(game.id), [game.id]);
  const songIndex = useMemo(() => catalog ? createSearchIndex(catalog, songFields) : null, [catalog, songFields]);
  const pageIndex = useMemo(() => createSearchIndex([...pages, ...gameItems, ...documentItems], ITEM_FIELDS), [pages, gameItems, documentItems]);

  const { sections, songMatchCount } = useMemo((): { sections: Section[]; songMatchCount: number } => {
    const tokens = parseSearchQuery(scopedQuery);
    const allActions = [...contextualActions, ...actions];
    if (tokens.length === 0 && scope === "all") {
      return {
        songMatchCount: 0,
        sections: [
          { group: "recent", items: recents.map(recentItem) },
          { group: "actions", items: allActions.filter(item => !item.searchOnly).slice(0, 5) },
          { group: "pages", items: pages.slice(0, 8) },
        ].filter(section => section.items.length > 0) as Section[],
      };
    }

    const actionHits = scope === "players" ? [] : searchIndex(createSearchIndex(allActions, ITEM_FIELDS), tokens);
    if (scope === "actions") {
      const items = tokens.length === 0 ? allActions : actionHits.map(hit => hit.item);
      return { songMatchCount: 0, sections: items.length > 0 ? [{ group: "actions", items }] : [] };
    }
    if (scope === "players") {
      return { songMatchCount: 0, sections: playerItems.length > 0 ? [{ group: "players", items: playerItems }] : [] };
    }

    const songHits = songIndex ? searchIndex(songIndex, tokens) : [];
    const otherHits = searchIndex(pageIndex, tokens);
    // Players come ranked by the server; locally they score as a strong match so an exact username can lead.
    const playerScore = playerItems.length > 0 ? Math.max(...searchIndex(createSearchIndex(playerItems, ITEM_FIELDS), tokens).map(hit => hit.score), 1) : 0;
    const byGroup = (group: PaletteGroup) => otherHits.filter(hit => hit.item.group === group);
    const ranked = [
      { group: "songs" as const, best: songHits[0]?.score ?? 0, items: songHits.slice(0, SONG_RESULTS).map(hit => songItem(hit.item)) },
      { group: "players" as const, best: playerScore, items: playerItems },
      ...(["pages", "events", "posts", "docs"] as const).map(group => {
        const hits = byGroup(group);
        return { group, best: hits[0]?.score ?? 0, items: hits.slice(0, group === "pages" ? 8 : 5).map(hit => hit.item) };
      }),
      { group: "actions" as const, best: actionHits[0]?.score ?? 0, items: actionHits.map(hit => hit.item) },
    ]
      .filter(section => section.items.length > 0)
      // The group with the best match leads, so "settings" puts pages first and a song title puts songs first.
      .sort((a, b) => b.best - a.best);
    return { songMatchCount: songHits.length, sections: ranked.map(({ group, items }) => ({ group, items })) };
  }, [scopedQuery, scope, songIndex, pageIndex, playerItems, pages, actions, contextualActions, recents]);

  const allItems = useMemo(() => sections.flatMap(section => section.items), [sections]);
  const selectedItem = allItems.find(item => item.id === selected) ?? allItems[0];

  const run = useCallback((item: PaletteItem) => {
    setOpen(false);
    if (item.remember && item.href) {
      setRecents(rememberRecent(game.id, {
        id: item.id,
        kind: item.song ? "song" : item.player ? "player" : "page",
        title: item.title,
        subtitle: item.subtitle,
        cover: item.cover,
        href: item.href,
      }));
    }
    if (item.perform) item.perform();
    else if (item.href) router.push(item.href);
  }, [setOpen, game.id, router]);

  const showAll = songMatchCount > SONG_RESULTS && scopedQuery.trim()
    ? { href: `/db/songs?q=${encodeURIComponent(scopedQuery.trim())}`, count: songMatchCount }
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
            {(catalogLoading || (searchesPlayers && playersLoading)) && query ? t("loadingCatalog") : scope === "players" && playerQuery.length < 2 ? t("playersHint") : t("empty", { query: scopedQuery })}
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
      {GameSearchSources && <GameSearchSources enabled={open} onItems={setGameItems} />}
      {!isMobile && (
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border/60 px-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t("hints.navigate")}</span>
          <span className="flex items-center gap-1.5"><Kbd><CornerDownLeft className="size-3" /></Kbd>{t("hints.open")}</span>
          <span className="flex items-center gap-1.5"><Kbd>esc</Kbd>{t("hints.close")}</span>
          <span className="ml-auto flex items-center gap-1.5"><Kbd>@</Kbd>{t("hints.players")}<Kbd>&gt;</Kbd>{t("hints.actions")}</span>
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

function useSongScores(song: UniqueSong | undefined) {
  const game = useGame();
  const { data: session } = useSession();
  const { data } = trpc.user.getSongScores.useQuery(
    song ? { game: game.id, songName: song.songName, artist: song.artist, type: song.type, parentIds: song.parentIds } : { game: game.id, songName: "", type: "" },
    { enabled: !!song && !!session?.user && supportsGameFeature(game, "scores"), staleTime: 60000, retry: false },
  );
  // The region the player has scored the most charts in.
  return useMemo(() => {
    const regions = Object.values(data?.userScores ?? {});
    return regions.sort((a, b) => Object.keys(b).length - Object.keys(a).length)[0] ?? null;
  }, [data]);
}

function Preview({ item }: { item: PaletteItem }) {
  const t = useTranslations("commandPalette");
  const game = useGame().id;
  const Icon = item.icon;
  const song = item.song;
  const player = item.player;
  const scores = useSongScores(song);
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
              const score = scores?.[chart.difficulty];
              return (
                <div key={chart.difficulty} className="flex items-center gap-2 text-sm">
                  <span className={cn("w-20 shrink-0 truncate text-xs font-semibold", difficulty.classes.text)}>{difficulty.label}</span>
                  <span className="font-semibold tabular-nums">{chart.level}</span>
                  {chart.levelPrecise > 0 && <span className="text-xs tabular-nums text-muted-foreground">{(chart.levelPrecise / 10).toFixed(1)}</span>}
                  {score && (
                    <span className="ml-auto text-right text-xs tabular-nums">
                      <span className="font-semibold">{getGrade(game, score.scoreValue)}</span>{" "}
                      <span className="text-muted-foreground">{formatGameScore(game, score.scoreValue, { precision: "compact" })}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {scores && <p className="text-xs text-muted-foreground">{t("preview.yourScores")}</p>}
        </>
      ) : player ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          {player.image ? (
            <CoverImage coverUrl={player.image} alt="" width={96} height={96} className="size-24 rounded-full object-cover shadow-sm" />
          ) : (
            <span className="grid size-24 place-items-center rounded-full bg-muted/70 text-muted-foreground"><User className="size-10" /></span>
          )}
          <div className="space-y-1">
            <p className="text-base font-semibold">{player.displayName ?? player.username}</p>
            <p className="text-sm text-muted-foreground">@{player.username}</p>
          </div>
          {player.rating !== null && (
            <p className="rounded-full bg-muted/70 px-3 py-1 text-sm font-semibold tabular-nums">{t("preview.rating", { rating: formatGameRating(game, player.rating) })}</p>
          )}
          <p className="text-xs text-muted-foreground">{t("hints.openProfile")}</p>
        </div>
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
