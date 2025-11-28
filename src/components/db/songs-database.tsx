"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerOverlay,
} from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { FilterPanel, FilterCategory, GenericFilter, getFilterKey } from "@/components/filter-panel";
import { trpc } from "@/lib/trpc-client";
import { cn, createSafeMaimaiImageUrl } from "@/lib/utils";
import { getVersionInfo } from "@/lib/metadata";
import { Search, Music, LayoutGrid, LayoutList, Loader2, Globe, Calendar, Disc3, Folder, X, Activity, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { useState, useMemo, useCallback, useEffect } from "react";
import { motion } from "motion/react";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";

export interface UniqueSong {
  songName: string;
  artist: string;
  cover: string;
  type: "std" | "dx";
  genre: string;
  addedVersion: number;
  slug: string;
}

// Type for song details (matches the getSongDetails return type)
export interface SongDetails {
  songName: string;
  artist: string;
  cover: string;
  type: "std" | "dx";
  genre: string;
  bpm: number | null;
  addedVersion: number;
  regions: {
    region: string;
    versions: {
      gameVersion: number;
      charts: {
        id: string;
        songName: string;
        artist: string;
        cover: string;
        difficulty: string;
        level: string;
        levelPrecise: number;
        type: "std" | "dx";
        genre: string;
        region: string;
        gameVersion: number;
        addedVersion: number;
        bpm: number | null;
        noteDesigner: string | null;
        tapCount: number | null;
        holdCount: number | null;
        slideCount: number | null;
        touchCount: number | null;
        breakCount: number | null;
      }[];
    }[];
  }[];
}

// Filter types for unique songs
type UniqueSongFilterType = "type" | "genre" | "addedVersion";

interface UniqueSongFilter extends GenericFilter {
  type: UniqueSongFilterType;
}

// Create filter categories for unique songs
function createUniqueSongFilterCategories(songs: UniqueSong[]): FilterCategory[] {
  // Get unique genres from songs
  const genres = [...new Set(songs.map(s => s.genre))].sort();
  
  // Get unique addedVersions from songs
  const addedVersions = [...new Set(songs.map(s => s.addedVersion))].sort((a, b) => b - a);

  return [
    {
      type: "type",
      label: "Type",
      icon: Disc3,
      options: [
        { value: "std", label: "Standard" },
        { value: "dx", label: "DX" },
      ],
    },
    {
      type: "genre",
      label: "Genre",
      icon: Folder,
      options: genres.map(g => ({ value: g, label: g })),
    },
    {
      type: "addedVersion",
      label: "Added Version",
      icon: Calendar,
      options: addedVersions.map(v => {
        const versionInfo = getVersionInfo(v);
        return { value: String(v), label: versionInfo?.name ?? `v${v}` };
      }),
    },
  ];
}

// Apply filters to unique songs
function applyUniqueSongFilters(songs: UniqueSong[], filters: UniqueSongFilter[]): UniqueSong[] {
  if (filters.length === 0) return songs;

  return songs.filter(song => {
    // Group filters by type
    const typeFilters = filters.filter(f => f.type === "type");
    const genreFilters = filters.filter(f => f.type === "genre");
    const versionFilters = filters.filter(f => f.type === "addedVersion");

    // Type filter (OR within group)
    if (typeFilters.length > 0) {
      const matchesType = typeFilters.some(f => song.type === f.value);
      if (!matchesType) return false;
    }

    // Genre filter (OR within group)
    if (genreFilters.length > 0) {
      const matchesGenre = genreFilters.some(f => song.genre === f.value);
      if (!matchesGenre) return false;
    }

    // Added version filter (OR within group)
    if (versionFilters.length > 0) {
      const matchesVersion = versionFilters.some(f => String(song.addedVersion) === f.value);
      if (!matchesVersion) return false;
    }

    return true;
  });
}

// Song grid card component
function SongCard({ song, index, isSelected, onSelect }: { 
  song: UniqueSong; 
  index: number; 
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
}) {
  const href = `/db/songs/${encodeURIComponent(song.slug)}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(song);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const percentX = (x - centerX) / centerX;
    const percentY = -((y - centerY) / centerY);

    card.style.transform = `perspective(1000px) rotateY(${percentX * 6}deg) rotateX(${percentY * 6}deg) scale3d(1.02, 1.02, 1.02)`;

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    if (glow) {
      glow.style.opacity = '1';
      glow.style.background = `
        radial-gradient(
          circle at ${x}px ${y}px,
          rgba(255, 255, 255, 0.2),
          rgba(255, 255, 255, 0.1),
          transparent
        )
      `;
    }
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const card = e.currentTarget;
    card.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) scale3d(1, 1, 1)';

    const glow = card.querySelector('.song-card-glow') as HTMLElement;
    if (glow) {
      glow.style.opacity = '0';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: Math.min(index * 0.015, 0.25),
        ease: [0.4, 0, 0.2, 1]
      }}
      layoutId={`song-card-${song.slug}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "block relative rounded-lg overflow-hidden cursor-pointer ring-2 transition-all duration-300 ease-out",
          song.type === "dx" ? "ring-amber-400" : "ring-slate-300",
          isSelected && "ring-4 ring-violet-500"
        )}
        style={{ aspectRatio: '1/1', transformStyle: 'preserve-3d', transform: 'perspective(1000px)' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <Image
          src={createSafeMaimaiImageUrl(song.cover)}
          alt={song.songName}
          fill
          className="object-cover"
          loading="lazy"
        />

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

        {/* Type Badge */}
        <div className="absolute top-2 left-2 z-10">
          <Image
            src={createSafeMaimaiImageUrl(song.type === "dx"
              ? "https://maimaidx.jp/maimai-mobile/img/music_dx.png"
              : "https://maimaidx.jp/maimai-mobile/img/music_standard.png"
            )}
            alt={song.type.toUpperCase()}
            width={32}
            height={10}
            className="drop-shadow-md"
            loading="lazy"
          />
        </div>

        {/* Glow Effect */}
        <div className="song-card-glow absolute -inset-2 opacity-0 transition-opacity duration-300 pointer-events-none rounded-lg" />

        {/* Song Info */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white">
          <h3 className="text-sm font-semibold truncate mb-0.5 drop-shadow-md">
            {song.songName}
          </h3>
          <p className="text-[11px] text-white/80 truncate drop-shadow-md">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// Song list row component
function SongRow({ song, index, isSelected, onSelect }: { 
  song: UniqueSong; 
  index: number; 
  isSelected: boolean;
  onSelect: (song: UniqueSong) => void;
}) {
  const href = `/db/songs/${encodeURIComponent(song.slug)}`;

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSelect(song);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: Math.min(index * 0.008, 0.15),
        ease: [0.4, 0, 0.2, 1]
      }}
      layoutId={`song-row-${song.slug}`}
    >
      <Link
        href={href}
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors",
          isSelected && "bg-violet-100 hover:bg-violet-100"
        )}
      >
        <Image
          src={createSafeMaimaiImageUrl(song.cover)}
          alt={song.songName}
          className={cn(
            "w-10 h-10 rounded ring-2 ring-offset-2 ring-offset-background",
            song.type === "dx" ? "ring-amber-400" : "ring-slate-300",
          )}
          width={40}
          height={40}
          loading="lazy"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium truncate">{song.songName}</h3>
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
              song.type === "dx" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            )}>
              {song.type.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {song.artist}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

// Song detail sheet content
function SongDetailContent({ songName, type, onClose, initialData }: {
  songName: string;
  type: "std" | "dx";
  onClose: () => void;
  initialData?: SongDetails | null;
}) {
  const { data: fetchedData, isLoading, error } = trpc.user.getSongDetails.useQuery(
    { songName, type },
    { 
      staleTime: 300000,
      enabled: !initialData,
    }
  );

  const data = initialData ?? fetchedData;

  if (!initialData && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Failed to load song details
      </div>
    );
  }

  const difficultyColors: Record<string, { bg: string; text: string; border: string }> = {
    basic: { bg: "bg-emerald-500", text: "text-emerald-600", border: "border-emerald-500" },
    advanced: { bg: "bg-amber-500", text: "text-amber-600", border: "border-amber-500" },
    expert: { bg: "bg-rose-500", text: "text-rose-600", border: "border-rose-500" },
    master: { bg: "bg-violet-500", text: "text-violet-600", border: "border-violet-500" },
    remaster: { bg: "bg-violet-300", text: "text-violet-500", border: "border-violet-300" },
    utage: { bg: "bg-pink-500", text: "text-pink-600", border: "border-pink-500" },
  };

  const difficultyLabels: Record<string, string> = {
    basic: "BASIC",
    advanced: "ADVANCED",
    expert: "EXPERT",
    master: "MASTER",
    remaster: "Re:MASTER",
    utage: "UTAGE",
  };

  const difficultyOrder = ["basic", "advanced", "expert", "master", "remaster", "utage"];

  // Get the latest version's charts for display (prefer intl, then jp)
  const latestRegion = data.regions.find(r => r.region === "intl") || data.regions[0];
  const latestVersion = latestRegion?.versions[0];
  const latestCharts = latestVersion?.charts ?? [];

  // Sort charts by difficulty order
  const sortedCharts = [...latestCharts].sort((a, b) => 
    difficultyOrder.indexOf(a.difficulty) - difficultyOrder.indexOf(b.difficulty)
  );

  const addedVersionInfo = getVersionInfo(data.addedVersion);

  return (
    <div className="space-y-6">
      {/* Cover and basic info */}
      <div className="flex gap-4">
        <div className="relative w-24 h-24 shrink-0 rounded-lg overflow-hidden ring-2 ring-offset-2 ring-offset-background ring-slate-200">
          <Image
            src={createSafeMaimaiImageUrl(data.cover)}
            alt={data.songName}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0 my-auto">
          <h2 className="text-xl font-bold truncate">{data.songName}</h2>
          <p className="text-muted-foreground truncate">{data.artist}</p>
          <div className="flex items-center gap-2 mt-2">
            <Image
              src={createSafeMaimaiImageUrl(data.type === "dx"
                ? "https://maimaidx.jp/maimai-mobile/img/music_dx.png"
                : "https://maimaidx.jp/maimai-mobile/img/music_standard.png"
              )}
              alt={data.type.toUpperCase()}
              width={64}
              height={20}
              className="drop-shadow-sm"
            />
            <span className="text-xs text-muted-foreground">{data.genre}</span>
          </div>
        </div>
      </div>

      {/* Song Info */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {data.bpm && (
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-muted-foreground">BPM</span>
            <span>{data.bpm}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-muted-foreground">Added</span>
          <span>{addedVersionInfo?.name ?? `Ver. ${data.addedVersion}`}</span>
        </div>
      </div>

      {/* Charts Grid */}
      {sortedCharts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Music className="w-4 h-4" />
            Charts
          </h3>

          <div className="border rounded-md overflow-hidden grid grid-cols-[minmax(100px,1fr)_auto_1fr_1fr_1fr_1fr_1fr]">
            {/* Header Row */}
            <div className="contents text-xs bg-accent/50 font-medium text-muted-foreground">
              <div className="py-2 px-3 border-b">Difficulty</div>
              <div className="py-2 px-3 text-center border-b">Level</div>
              <div className="py-2 px-3 text-center border-b">Notes</div>
              <div className="py-2 px-3 text-center border-b">Tap</div>
              <div className="py-2 px-3 text-center border-b">Hold</div>
              <div className="py-2 px-3 text-center border-b">Slide</div>
              <div className="py-2 px-3 text-center border-b">Break</div>
            </div>

            {/* Chart Rows */}
            {sortedCharts.map((chart, index) => {
              const colors = difficultyColors[chart.difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
              const hasNoteData = chart.tapCount !== null;
              const totalNotes = hasNoteData 
                ? (chart.tapCount ?? 0) + (chart.holdCount ?? 0) + (chart.slideCount ?? 0) + (chart.touchCount ?? 0) + (chart.breakCount ?? 0)
                : null;
              const isLast = index === sortedCharts.length - 1;
              const hasDesigner = !!chart.noteDesigner;
              
              // Show border on data row only if there is no designer row following it
              // (and it's not the last row of the table)
              const dataBorderClass = hasDesigner ? "" : (isLast ? "" : "border-b");
              
              // Show border on designer row unless it's the last row of the table
              const designerBorderClass = isLast ? "" : "border-b";

              return (
                <div key={chart.difficulty} className="contents text-sm">
                  {/* Difficulty */}
                  <div className={cn("py-2.5 px-3 flex items-center gap-2", dataBorderClass)}>
                    <span className={cn("font-bold", colors.text)}>
                      {difficultyLabels[chart.difficulty] || chart.difficulty.toUpperCase()}
                    </span>
                  </div>
                  {/* Level */}
                  <div className={cn("py-2.5 px-3 flex items-baseline justify-center gap-1", dataBorderClass)}>
                    <span className="text-lg font-bold tabular-nums">{chart.level}</span>
                    <span className="text-xs text-muted-foreground">({(chart.levelPrecise / 10).toFixed(1)})</span>
                  </div>
                  {/* Notes */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? totalNotes : "-"}
                  </div>
                  {/* Tap */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.tapCount : "-"}
                  </div>
                  {/* Hold */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.holdCount : "-"}
                  </div>
                  {/* Slide */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.slideCount : "-"}
                  </div>
                  {/* Break */}
                  <div className={cn("py-2.5 px-3 flex items-center justify-center tabular-nums", dataBorderClass)}>
                    {hasNoteData ? chart.breakCount : "-"}
                  </div>
                  
                  {/* Designer row (spans all columns) */}
                  {chart.noteDesigner && (
                    <div className={cn(
                      "col-span-full px-3 pb-2 pt-0 flex items-center gap-1.5 text-xs text-muted-foreground",
                      designerBorderClass
                    )}>
                      <Pencil className="w-3 h-3" />
                      <span>{chart.noteDesigner}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Availability by region */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Globe className="w-4 h-4" />
          Availability
        </h3>

        {data.regions.map(({ region, versions }) => (
          <div key={region} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {region === "intl" ? "International" : "Japan"}
              </span>
            </div>

            <div className="space-y-3 pl-4 border-l-2 border-muted">
              {versions.map(({ gameVersion, charts }) => {
                const versionInfo = getVersionInfo(gameVersion);
                
                // Group charts by difficulty to show level changes
                const byDifficulty = new Map<string, typeof charts[0][]>();
                charts.forEach(chart => {
                  if (!byDifficulty.has(chart.difficulty)) {
                    byDifficulty.set(chart.difficulty, []);
                  }
                  byDifficulty.get(chart.difficulty)!.push(chart);
                });

                // Sort by difficulty order
                const sortedDifficulties = Array.from(byDifficulty.entries()).sort((a, b) =>
                  difficultyOrder.indexOf(a[0]) - difficultyOrder.indexOf(b[0])
                );

                return (
                  <div key={gameVersion} className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{versionInfo?.name ?? `v${gameVersion}`}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {sortedDifficulties.map(([difficulty, diffCharts]) => {
                        const chart = diffCharts[0];
                        const colors = difficultyColors[difficulty] || { bg: "bg-gray-500", text: "text-gray-600", border: "border-gray-500" };
                        return (
                          <div
                            key={difficulty}
                            className={cn(
                              "px-2 py-0.5 rounded text-xs font-medium text-white",
                              colors.bg
                            )}
                          >
                            {difficultyLabels[difficulty] || difficulty.toUpperCase()} {(chart.levelPrecise / 10).toFixed(1)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SongsDatabaseProps {
  selectedSlug: string | null;
  initialSongs: UniqueSong[];
  initialSongDetails?: SongDetails | null;
}

export function SongsDatabase({ selectedSlug: initialSlug, initialSongs, initialSongDetails }: SongsDatabaseProps) {
  const t = useTranslations();
  
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
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Use initialSongs directly - data is SSR'd from the server
  const allSongs = initialSongs;

  // Create filter categories based on available data
  const filterCategories = useMemo(() => {
    return createUniqueSongFilterCategories(allSongs);
  }, [allSongs]);

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
        song.genre.toLowerCase().includes(query)
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-lg" aria-hidden="true">
              <Music className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Songs Database</h1>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {filteredSongs.length.toLocaleString()} songs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2" role="group" aria-label="Display options">
            {/* Display Mode */}
            <div className="flex items-center border rounded-lg overflow-hidden" role="radiogroup" aria-label="View mode">
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Search songs, artists, genres..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-10"
            aria-label="Search songs"
          />
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
          <h2 className="text-lg font-medium mb-2">No songs found</h2>
          <p className="text-muted-foreground max-w-sm">
            {searchQuery ? "Try adjusting your search" : "No songs available"}
          </p>
        </div>
      )}

      {/* Songs Grid */}
      {filteredSongs.length > 0 && displayMode === "grid" && (
        <section aria-label="Songs grid" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
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
      <Drawer defaultOpen={!!selectedSong && currentSlug === initialSlug && currentSlug === selectedSong?.slug} open={!!selectedSong} onOpenChange={(open) => !open && handleCloseDetail()}>
        <DrawerOverlay className="bg-transparent"/>
        <DrawerContent className="bg-card">
          <VisuallyHidden>
            <DrawerTitle>{selectedSong?.songName || "Song Details"}</DrawerTitle>
            <DrawerDescription>{selectedSong?.artist || "Song artist"}</DrawerDescription>
          </VisuallyHidden>
          <div className="relative px-4 pt-4 pb-8 max-h-[70vh] overflow-y-auto">
            <div className="absolute top-2 right-3 z-20">
              <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={handleCloseDetail}>
                <X className="h-4 w-4 text-neutral-400 stroke-3" />
              </Button>
            </div>
            <div className="max-w-2xl mx-auto">

            {selectedSong && (
              <article aria-label={`Details for ${selectedSong.songName}`}>
                <SongDetailContent
                  songName={selectedSong.songName}
                  type={selectedSong.type}
                  onClose={handleCloseDetail}
                  initialData={selectedSong.slug === initialSlug ? initialSongDetails : null}
                />
              </article>
            )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}
