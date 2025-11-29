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
import { cn } from "@/lib/utils";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { LayoutGrid, LayoutList, Music, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";

import { applyUniqueSongFilters, createUniqueSongFilterCategories } from "./songs/filter-utils";
import { SongCard } from "./songs/song-card";
import { SongDetailContent } from "./songs/song-detail-content";
import { SongRow } from "./songs/song-row";
import { SongDetails, UniqueSong, UniqueSongFilter, UniqueSongFilterType } from "./songs/types";

interface SongsDatabaseProps {
  selectedSlug: string | null;
  initialSongs: UniqueSong[];
  initialSongDetails?: SongDetails | null;
}

export function SongsDatabase({ selectedSlug: initialSlug, initialSongs, initialSongDetails }: SongsDatabaseProps) {
  const t = useTranslations();
  
  // Helper for filter translations
  const tFilter = useMemo(() => (key: string) => t(`db.songs.filter.${key}`), [t]);

  const [searchQuery, setSearchQuery] = useState("");
  const [displayMode, setDisplayMode] = useState<"grid" | "list">("grid");
  const [visibleCount, setVisibleCount] = useState(60);
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

  // Create filter categories based on available data
  const filterCategories = useMemo(() => {
    return createUniqueSongFilterCategories(allSongs, tFilter);
  }, [allSongs, tFilter]);

  // Filter handlers
  const handleAddFilter = useCallback((filter: GenericFilter) => {
    setFilters(prev => {
      const newFilter = { type: filter.type as UniqueSongFilterType, value: filter.value };
      const key = getFilterKey(newFilter);
      if (prev.some(f => getFilterKey(f) === key)) return prev;
      return [...prev, newFilter];
    });
  }, []);

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

  // Filter songs by search and filters
  const filteredSongs = useMemo(() => {
    let result = allSongs;

    // Apply filters
    result = applyUniqueSongFilters(result, filters);

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(song =>
        song.songName.toLowerCase().includes(query) ||
        song.artist.toLowerCase().includes(query) ||
        song.genre.toLowerCase().includes(query) ||
        song.aliases?.some(alias => alias.toLowerCase().includes(query))
      );
    }

    return result;
  }, [allSongs, filters, searchQuery]);

  // Visible songs for infinite scroll
  const visibleSongs = useMemo(() => {
    return filteredSongs.slice(0, visibleCount);
  }, [filteredSongs, visibleCount]);

  // Reset visible count when search or filters change
  useEffect(() => {
    setVisibleCount(60);
  }, [searchQuery, filters]);

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

  return (
    <main className="space-y-6 pb-16" role="main">
      {/* Header */}
      <header className="flex flex-col gap-4">
        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              placeholder={t("db.songs.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10"
              aria-label={t("db.songs.searchPlaceholder")}
            />
          </div>

          <div className="flex items-center gap-2" role="group" aria-label="Display options">
            {/* Display Mode */}
            <div className="flex items-center border rounded-lg overflow-hidden h-10" role="radiogroup" aria-label="View mode">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none h-9 px-3",
                  displayMode === "grid" && "bg-muted"
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
                  "rounded-none h-9 px-3",
                  displayMode === "list" && "bg-muted"
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
          allItems={allSongs}
          categories={filterCategories}
          applyFilters={(data, f) => applyUniqueSongFilters(data as UniqueSong[], f as UniqueSongFilter[])}
          getFilterLabel={(filter) => {
            const category = filterCategories.find(c => c.type === filter.type);
            const option = category?.options.find(o => o.value === filter.value);
            return option?.label ?? filter.value;
          }}
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
            {searchQuery ? t("db.songs.tryAdjustingSearch") : t("db.songs.noSongsAvailable")}
          </p>
        </div>
      )}

      {/* Songs Grid */}
      {filteredSongs.length > 0 && displayMode === "grid" && (
        <section aria-label="Songs grid" className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2">
          {visibleSongs.map((song, index) => (
            <SongCard
              key={`${song.songName}-${song.type}`}
              song={song}
              index={index}
              isSelected={isSongSelected(song)}
              onSelect={handleSelectSong}
            />
          ))}
          {hasMore && <div ref={sentinelRef} className="col-span-full h-4" aria-hidden="true" />}
        </section>
      )}

      {/* Songs List */}
      {filteredSongs.length > 0 && displayMode === "list" && (
        <section aria-label="Songs list" className="space-y-1">
          {visibleSongs.map((song, index) => (
            <SongRow
              key={`${song.songName}-${song.type}`}
              song={song}
              index={index}
              isSelected={isSongSelected(song)}
              onSelect={handleSelectSong}
            />
          ))}
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
        <DrawerContent className="bg-card mx-auto w-[calc(min(100dvw-1rem,_42rem))] max-h-[90%] h-full shadow-2xl">
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
        <div className="absolute left-[-9999px] opacity-0" aria-hidden="true">
          <SongDetailContent
            songName={lastValidSong.songName}
            type={lastValidSong.type}
            onClose={() => {}}
            initialData={initialSongDetails}
          />
        </div>
      )}
    </main>
  );
}
