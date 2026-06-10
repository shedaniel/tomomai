"use client";

import { FilterPanel, GenericFilter, getFilterKey } from "@/components/filter-panel";
import { Button } from "@tomomai/ui";
import { Input } from "@tomomai/ui";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getVersionInfo } from "@tomomai/catalog/metadata";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { LayoutGrid, LayoutList, Music, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@tomomai/ui/select-friendly";
import { applyUniqueSongFilters, createUniqueSongFilterCategories, hashString } from "./songs/filter-utils";
import { SongCard } from "./songs/song-card";
import { SongRow } from "./songs/song-row";
import { GroupMode, UniqueSong, UniqueSongFilter, UniqueSongFilterType } from "./songs/types";

interface SongsListProps {
  /** Server-fetched songs catalog (passed by /db/[type]/layout for type=songs). */
  initialSongs: UniqueSong[];
}

/**
 * Songs catalog list. Pure list — does NOT own the song-detail drawer.
 *
 * Mounted in /db/[type]/layout.tsx so it persists across /db/songs ↔
 * /db/songs/[slug] navigation (filter/scroll state survives drawer
 * open/close). The selected song highlight is derived from the URL via
 * `usePathname()`, and selecting a song does a soft `router.push` to the
 * slug route — which feeds content into the @detail parallel slot at the
 * /db level, where the drawer wrapper picks it up.
 */
export function SongsList({ initialSongs }: SongsListProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const tFilter = useMemo(() => (key: string) => t(`db.songs.filter.${key}`), [t]);
  const tGroups = useMemo(() => (key: string) => t(`db.songs.filter.groups.${key}`), [t]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchBoxFocused, setSearchBoxFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery === debouncedSearchQuery) return;
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [displayMode, setDisplayMode] = useState<"grid" | "list">("grid");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [filters, setFilters] = useState<UniqueSongFilter[]>([]);

  // Use the server-provided initial data; refresh via tRPC client cache.
  const { data: allSongs } = trpc.user.getAllUniqueSongs.useQuery(undefined, {
    staleTime: 3600000, // 1 hour
    refetchOnWindowFocus: false,
    initialData: initialSongs,
  });

  const flattenedSongs = useMemo(() => {
    return allSongs?.flatMap(song => song.difficulties.map(difficulty => ({
      ...song,
      difficulties: [{
        ...difficulty,
        noteDesignerNumber: hashString(difficulty.noteDesigner ?? ""),
      }],
    })));
  }, [allSongs]);

  const filterCategories = useMemo(() => {
    return allSongs ? createUniqueSongFilterCategories(allSongs, tFilter) : null;
  }, [allSongs, tFilter]);

  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setFilters(prev => {
      const category = filterCategories?.find(c => c.type === filter.type);
      let newFilters = prev;
      if (category?.limit_one) {
        newFilters = prev.filter(f => f.type !== filter.type);
      }
      const newFilter = { type: filter.type as UniqueSongFilterType, value: filter.value };
      const key = getFilterKey(newFilter);
      if (newFilters.some(f => getFilterKey(f) === key)) return newFilters;
      return [...newFilters, newFilter];
    });
  }, [filterCategories]);

  const handleRemoveFilter = useCallback((filter: GenericFilter) => {
    setFilters(prev => prev.filter(f => !(f.type === filter.type && f.value === filter.value)));
  }, []);

  const applyFilters = useCallback((f: GenericFilter[]) => {
    return applyUniqueSongFilters(allSongs!, flattenedSongs!, f as UniqueSongFilter[]);
  }, [allSongs, flattenedSongs]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    const category = filterCategories?.find(c => c.type === filter.type);
    const option = category?.options.find(o => o.value === filter.value);
    return option?.label ?? filter.value;
  }, [filterCategories]);

  const allFilteredSongs = useMemo(() => {
    return allSongs && flattenedSongs ? applyUniqueSongFilters(allSongs, flattenedSongs, filters, groupMode) : null;
  }, [allSongs, flattenedSongs, filters, groupMode]);

  const filteredSongs = useMemo(() => {
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      return allFilteredSongs?.filter(song =>
        song.songName.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.genre.toLowerCase().includes(query) ||
        song.aliases?.some(alias => alias.toLowerCase().includes(query))
      ) ?? null;
    }
    return allFilteredSongs;
  }, [allFilteredSongs, debouncedSearchQuery]);

  const [visibleCount, setVisibleCount] = useState(60);
  const visibleSongs = useMemo(() => {
    return filteredSongs?.slice(0, visibleCount) ?? null;
  }, [filteredSongs, visibleCount]);

  useEffect(() => {
    setVisibleCount(60);
  }, [debouncedSearchQuery, filters, groupMode]);

  const hasMore = !!filteredSongs && visibleCount < filteredSongs.length;
  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount(prev => Math.min(prev + 60, filteredSongs!.length));
    }
  }, [hasMore, filteredSongs]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Derive selected slug from URL: /db/songs/<slug> → <slug>, else null.
  const selectedSlug = useMemo(() => {
    if (!pathname) return null;
    const match = pathname.match(/^\/db\/songs\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const handleSelectSong = useCallback((song: UniqueSong) => {
    router.push(`/db/songs/${encodeURIComponent(song.slug)}`, { scroll: false });
  }, [router]);

  const isSongSelected = useCallback((song: UniqueSong) => {
    return song.slug === selectedSlug;
  }, [selectedSlug]);

  const getGroupKey = useCallback((song: UniqueSong) => {
    switch (groupMode) {
      case "noteDesigner":
        return song.difficulties[0]?.noteDesigner ?? "Unknown";
      case "level_asc":
      case "level_desc": {
        const level = (song.difficulties[0]?.levelPrecise ?? 0) / 10;
        const isPlus = level % 1 >= 0.6;
        const baseLevel = Math.floor(level);
        return isPlus ? `${baseLevel}+` : `${baseLevel}`;
      }
      case "version_asc":
      case "version_desc":
        const version = getVersionInfo(song.addedVersion);
        return version?.name ?? `Ver. ${song.addedVersion}`;
      case "genre":
        return song.genre;
      case "artist":
        return song.artist;
      default:
        return null;
    }
  }, [groupMode]);

  const renderGroupHeader = (key: string) => (
    <div className="col-span-full mt-4 pb-2 first:pt-0">
      <h3 className="font-semibold text-lg text-foreground/90 border-b border-border/50 pb-1">{key}</h3>
    </div>
  );

  return (
    <main className="space-y-6 pb-16 pt-3" role="main" data-nosnippet>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("db.songs.heading")}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          {t("db.songs.metadata.description")}
        </p>
      </header>

      <header className="flex flex-col gap-4">
        <div className="flex gap-2">
          <div className="relative flex-1 h-10" onClick={() => searchInputRef.current?.focus()}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder={t("db.songs.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-full"
              aria-label={t("db.songs.searchPlaceholder")}
              onFocus={() => setSearchBoxFocused(true)}
              onBlur={() => setSearchBoxFocused(false)}
              ref={searchInputRef}
            />
          </div>

          <div className="flex items-stretch gap-2 h-10" role="group" aria-label="Display options">
            <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <SelectTrigger className={cn("w-[200px] max-xs:w-[100px] h-full transition-all duration-200 truncate", searchBoxFocused && "max-sm:w-10")} aria-label={t("db.songs.filter.groupBy")}>
                <SelectValue placeholder={t("db.songs.filter.groupBy")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tGroups("none")}</SelectItem>
                <SelectItem value="noteDesigner">{tGroups("noteDesigner")}</SelectItem>
                <SelectItem value="level_asc">{tGroups("levelAsc")}</SelectItem>
                <SelectItem value="level_desc">{tGroups("levelDesc")}</SelectItem>
                <SelectItem value="version_asc">{tGroups("versionAsc")}</SelectItem>
                <SelectItem value="version_desc">{tGroups("versionDesc")}</SelectItem>
                <SelectItem value="genre">{tGroups("genre")}</SelectItem>
                <SelectItem value="artist">{tGroups("artist")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center rounded-md border border-border p-px" role="radiogroup" aria-label="View mode">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none rounded-l-md h-full px-3 transition-colors",
                  displayMode === "grid" && "bg-primary hover:bg-primary/80 text-primary-foreground hover:text-primary-foreground"
                )}
                onClick={() => setDisplayMode("grid")}
                aria-pressed={displayMode === "grid"}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none rounded-r-md h-full px-3 transition-colors",
                  displayMode === "list" && "bg-primary hover:bg-primary/80 text-primary-foreground hover:text-primary-foreground"
                )}
                onClick={() => setDisplayMode("list")}
                aria-pressed={displayMode === "list"}
                aria-label="List view"
              >
                <LayoutList className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {filterCategories && (
          <FilterPanel
            filters={filters}
            onAddFilter={handleAddFilter}
            onRemoveFilter={handleRemoveFilter}
            categories={filterCategories}
            applyFilters={applyFilters}
            getFilterLabel={getFilterLabel}
            triggerClassName="bg-background"
          />
        )}
      </header>

      {filteredSongs && filteredSongs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center" role="status">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4" aria-hidden="true">
            <Music className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium mb-2">{t("db.songs.noSongsFound")}</h2>
          <p className="text-muted-foreground max-w-sm">
            {debouncedSearchQuery ? t("db.songs.tryAdjustingSearch") : t("db.songs.noSongsAvailable")}
          </p>
        </div>
      )}

      {filteredSongs && filteredSongs.length > 0 && displayMode === "grid" && (
        <section aria-label="Songs grid" className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3">
          {visibleSongs?.map((song, index) => {
            const currentGroup = getGroupKey(song);
            const prevGroup = index > 0 ? getGroupKey(visibleSongs![index - 1]) : null;
            const showHeader = groupMode !== "none" && currentGroup !== null && currentGroup !== prevGroup;

            return (
              <div key={`${song.slug}-${song.difficulties.length === 1 ? song.difficulties[0].difficulty : ''}-${index}`} className="contents">
                {showHeader && renderGroupHeader(currentGroup!)}
                <SongCard
                  song={song}
                  index={index}
                  isSelected={isSongSelected(song)}
                  onSelect={handleSelectSong}
                />
              </div>
            );
          })}
          {hasMore && <div ref={sentinelRef} className="col-span-full h-4" aria-hidden="true" />}
        </section>
      )}

      {filteredSongs && filteredSongs.length > 0 && displayMode === "list" && (
        <section aria-label="Songs list" className="space-y-1">
          {visibleSongs?.map((song, index) => {
            const currentGroup = getGroupKey(song);
            const prevGroup = index > 0 ? getGroupKey(visibleSongs![index - 1]) : null;
            const showHeader = groupMode !== "none" && currentGroup !== null && currentGroup !== prevGroup;

            return (
              <div key={`${song.slug}-${song.difficulties.length === 1 ? song.difficulties[0].difficulty : ''}-${index}`} className="contents">
                {showHeader && renderGroupHeader(currentGroup!)}
                <SongRow
                  song={song}
                  index={index}
                  isSelected={isSongSelected(song)}
                  onSelect={handleSelectSong}
                />
              </div>
            );
          })}
          {hasMore && <div ref={sentinelRef} className="h-4" aria-hidden="true" />}
        </section>
      )}
    </main>
  );
}
