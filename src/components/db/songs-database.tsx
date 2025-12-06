"use client";

import { FilterPanel, GenericFilter, getFilterKey } from "@/components/filter-panel";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { getVersionInfo } from "@/lib/metadata";
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { LayoutGrid, LayoutList, Music, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select-friendly";

import { applyUniqueSongFilters, createUniqueSongFilterCategories, hashString } from "./songs/filter-utils";
import { SongCard } from "./songs/song-card";
import { SongDetailContent } from "./songs/song-detail-content";
import { SongRow } from "./songs/song-row";
import { GroupMode, SongDetails, UniqueSong, UniqueSongFilter, UniqueSongFilterType } from "./songs/types";

interface SongsDatabaseProps {
  selectedSlug: string | null;
  initialSongs: UniqueSong[];
  initialSongDetails?: SongDetails | null;
}

export function SongsDatabase({ selectedSlug: initialSlug, initialSongs, initialSongDetails }: SongsDatabaseProps) {
  const t = useTranslations();
  
  // Helper for filter translations
  const tFilter = useMemo(() => (key: string) => t(`db.songs.filter.${key}`), [t]);
  const tGroups = useMemo(() => (key: string) => t(`db.songs.filter.groups.${key}`), [t]);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchBoxFocused, setSearchBoxFocused] = useState<boolean>(false);
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
  const [visibleCount, setVisibleCount] = useState(initialSlug ? 0 : 200);
  const [filters, setFilters] = useState<UniqueSongFilter[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(initialSlug);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/db/songs') {
        setCurrentSlug(null);
      } else if (path.startsWith('/db/songs/')) {
        const slug = decodeURIComponent(path.slice('/db/songs/'.length));
        setCurrentSlug(slug);
        setSnap(0.6);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Use initialSongs directly - data is SSR'd from the server
  const allSongs = initialSongs;

  // Flatten songs by difficulty
  const flattenedSongs = useMemo(() => {
    return allSongs.flatMap(song => song.difficulties.map(difficulty => ({
      ...song,
      difficulties: [{
        ...difficulty,
        noteDesignerNumber: hashString(difficulty.noteDesigner ?? ""),
      }],
    })));
  }, [allSongs]);

  // Create filter categories based on available data
  const filterCategories = useMemo(() => {
    return createUniqueSongFilterCategories(allSongs, tFilter);
  }, [allSongs, tFilter]);

  // Filter handlers
  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setFilters(prev => {
      // Check if category has limit_one constraint
      const category = filterCategories.find(c => c.type === filter.type);
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

  // Find selected song from current slug
  const selectedSong = useMemo(() => {
    if (!currentSlug || allSongs.length === 0) return null;

    // Find song by matching slug
    return allSongs.find(song => song.slug === currentSlug) || null;
  }, [currentSlug, allSongs]);

  // Keep track of the last selected song to display during close animation
  const [displayedSong, setDisplayedSong] = useState<UniqueSong | null>(null);
  const [snap, setSnap] = useState<number | string | null>(0.6);

  const lastValidSong = selectedSong ?? displayedSong;

  // Update document title when selected song changes
  useEffect(() => {
    if (selectedSong) {
      setDisplayedSong(selectedSong);
      setSnap(0.6);
      document.title = `${selectedSong.songName} - ${selectedSong.artist} | maimai DX`;
    } else {
      document.title = t("db.songs.title");
    }
  }, [selectedSong, t]);

  const handleSnapChange = useCallback((snap: number | string | null) => {
    if (snap === 0) {
      handleCloseDetail();
    }
    setSnap(snap);
  }, []);

  const applyFilters = useCallback((f: GenericFilter[]) => {
    return applyUniqueSongFilters(allSongs, flattenedSongs, f as UniqueSongFilter[]);
  }, [allSongs, flattenedSongs]);

  const getFilterLabel = useCallback((filter: GenericFilter) => {
    const category = filterCategories.find(c => c.type === filter.type);
    const option = category?.options.find(o => o.value === filter.value);
    return option?.label ?? filter.value;
  }, [filterCategories]);

  const allFilteredSongs = useMemo(() => {
    return applyUniqueSongFilters(allSongs, flattenedSongs, filters, groupMode);
  }, [allSongs, flattenedSongs, filters, groupMode]);

  // Filter songs by search and filters
  const filteredSongs = useMemo(() => {
    // Apply search
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase().trim();
      return allFilteredSongs.filter(song =>
        song.songName.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.genre.toLowerCase().includes(query) ||
        song.aliases?.some(alias => alias.toLowerCase().includes(query))
      );
    }

    return allFilteredSongs;
  }, [allFilteredSongs, debouncedSearchQuery]);

  // Visible songs for infinite scroll
  const visibleSongs = useMemo(() => {
    return filteredSongs.slice(0, visibleCount);
  }, [filteredSongs, visibleCount]);

  // Reset visible count when search or filters change
  useEffect(() => {
    setVisibleCount(60);
  }, []); // Initial load
  useEffect(() => {
    setVisibleCount(60);
  }, [debouncedSearchQuery, filters, groupMode]);

  const hasMore = visibleCount < filteredSongs.length;
  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount(prev => Math.min(prev + 60, filteredSongs.length));
    }
  }, [hasMore, filteredSongs.length]);

  const sentinelRef = useInfiniteScroll(loadMore, hasMore);

  // Handle selecting a song (updates URL via history API)
  const handleSelectSong = useCallback((song: UniqueSong) => {
    const url = `/db/songs/${encodeURIComponent(song.slug)}`;
    window.history.pushState({ slug: song.slug }, '', url);
    setCurrentSlug(song.slug);
    setSnap(0.6);
  }, []);

  // Handle closing the detail sheet
  const handleCloseDetail = useCallback(() => {
    window.history.pushState({ slug: null }, '', '/db/songs');
    setCurrentSlug(null);
  }, []);

  // Check if a song is selected
  const isSongSelected = useCallback((song: UniqueSong) => {
    if (!selectedSong) return false;
    return song.songName === selectedSong.songName && song.type === selectedSong.type;
  }, [selectedSong]);

  // Helper to get group key
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
    <main className="space-y-6 pb-16" role="main">
      {!selectedSong && (
        <VisuallyHidden asChild>
          <h1>{t("db.songs.title")}</h1>
        </VisuallyHidden>
      )}
      {/* Header */}
      <header className="flex flex-col gap-4">
        {/* Search */}
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
            {/* Group By */}
            <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <SelectTrigger className={cn("w-[200px] max-xs:w-[100px] h-full transition-all duration-200 truncate", searchBoxFocused && "max-sm:w-10")} aria-label={t("db.songs.filter.groupBy")}>
                <SelectValue placeholder={t("db.songs.filter.groupBy")}/>
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

            {/* Display Mode */}
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

        {/* Filters */}
        <FilterPanel
          filters={filters}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
          categories={filterCategories}
          applyFilters={applyFilters}
          getFilterLabel={getFilterLabel}
          triggerClassName="bg-background"
        />
      </header>

      {/* Empty State */}
      {filteredSongs.length === 0 && (
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

      {/* Songs Grid */}
      {filteredSongs.length > 0 && displayMode === "grid" && (
        <section aria-label="Songs grid" className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-3">
          {visibleSongs.map((song, index) => {
            const currentGroup = getGroupKey(song);
            const prevGroup = index > 0 ? getGroupKey(visibleSongs[index - 1]) : null;
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

      {/* Songs List */}
      {filteredSongs.length > 0 && displayMode === "list" && (
        <section aria-label="Songs list" className="space-y-1">
          {visibleSongs.map((song, index) => {
            const currentGroup = getGroupKey(song);
            const prevGroup = index > 0 ? getGroupKey(visibleSongs[index - 1]) : null;
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

      {/* Song Detail Drawer */}
      <Drawer
        snapPoints={[0, 0.6, 1]}
        activeSnapPoint={snap}
        setActiveSnapPoint={handleSnapChange}
        fadeFromIndex={2}
        defaultOpen={!!selectedSong && currentSlug === initialSlug && currentSlug === selectedSong?.slug}
        open={!!selectedSong}
        onOpenChange={(open: boolean) => !open && handleCloseDetail()}
        dismissible
      >
        <DrawerOverlay />
        <DrawerContent className="bg-background mx-auto w-[calc(min(100dvw-1rem,42rem))] max-h-[90%] h-full shadow-2xl">
          <VisuallyHidden>
            <DrawerTitle>{lastValidSong?.songName || t("db.songs.detail.title")}</DrawerTitle>
            <DrawerDescription>{lastValidSong?.artist || t("db.songs.detail.artist")}</DrawerDescription>
          </VisuallyHidden>
          <div
            className={cn("relative px-6 pt-4 -mt-4", snap === 1 ? "overflow-y-auto" : "overflow-hidden")}
            style={{ scrollbarGutter: "stable" }}
            onWheel={(e) => {
              if (snap !== 1 && e.deltaY > 0) {
                setSnap(1);
                e.preventDefault();
              }
            }}
          >
            <div className="absolute top-2 right-3 z-20">
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={handleCloseDetail}>
                <X className="h-4 w-4 text-neutral-400 stroke-3" />
              </Button>
            </div>
            {lastValidSong && (
              <article aria-label={`Details for ${lastValidSong.songName}`}>
                <SongDetailContent
                  songName={lastValidSong.songName}
                  slug={lastValidSong.slug}
                  type={lastValidSong.type}
                  onClose={handleCloseDetail}
                  initialData={lastValidSong.slug === initialSlug ? initialSongDetails : null}
                />
              </article>
            )}
            <div className="h-8" />
          </div>
        </DrawerContent>
      </Drawer>

      {/* SEO Content: Render hidden content for crawlers when accessing a specific song URL */}
      {initialSlug && lastValidSong && lastValidSong.slug === initialSlug && (
        <VisuallyHidden asChild>
          <div>
            <SongDetailContent
              songName={lastValidSong.songName}
              slug={lastValidSong.slug}
              type={lastValidSong.type}
              onClose={() => {}}
              initialData={initialSongDetails}
            />
          </div>
        </VisuallyHidden>
      )}
    </main>
  );
}
