import { FilterCategory } from "@/components/filter-panel";
import { getVersionInfo } from "@/lib/metadata";
import { Disc3, Folder, Calendar, ArrowUpDown, BarChart } from "lucide-react";
import { UniqueSong, UniqueSongFilter } from "./types";
import { LEVEL_ENUM } from "@/lib/db/types";

// Create filter categories for unique songs
export function createUniqueSongFilterCategories(
  songs: UniqueSong[],
  t?: (key: string) => string
): FilterCategory[] {
  // Helper to get translation or fallback
  const getLabel = (key: string, fallback: string) => t?.(key) ?? fallback ?? key;

  // Get unique genres from songs
  const genres = [...new Set(songs.map(s => s.genre))].sort();

  // Get unique addedVersions from songs
  const addedVersions = [...new Set(songs.map(s => s.addedVersion))].sort((a, b) => b - a);

  return [
    {
      type: "sort",
      label: getLabel("sort", "Sort"),
      icon: ArrowUpDown,
      options: [
        { value: "version_desc", label: getLabel("sortVersionDesc", "Version (Latest)") },
        { value: "version_asc", label: getLabel("sortVersionAsc", "Version (Oldest)") },
        { value: "level_asc", label: getLabel("sortLevelAsc", "Level (Low -> High)") },
        { value: "level_desc", label: getLabel("sortLevelDesc", "Level (High -> Low)") },
      ],
      limit_one: true,
    },
    {
      type: "level",
      label: getLabel("level", "Level"),
      icon: BarChart,
      options: LEVEL_ENUM.map((l, i) => ({ value: l, label: l, i })).toSorted((a, b) => b.i - a.i),
    },
    {
      type: "type",
      label: getLabel("type", "Type"),
      icon: Disc3,
      options: [
        { value: "std", label: getLabel("std", "Standard") },
        { value: "dx", label: getLabel("dx", "DX") },
      ],
    },
    {
      type: "genre",
      label: getLabel("genre", "Genre"),
      icon: Folder,
      options: genres.map(g => ({ value: g, label: g })),
    },
    {
      type: "addedVersion",
      label: getLabel("addedVersion", "Added Version"),
      icon: Calendar,
      options: addedVersions.map(v => {
        const versionInfo = getVersionInfo(v);
        return { value: String(v), label: versionInfo?.name ?? `v${v}` };
      }),
    },
  ];
}

// Apply filters to unique songs
export function applyUniqueSongFilters(songs: UniqueSong[], filters: UniqueSongFilter[]): UniqueSong[] {
  // Check if we need to flatten songs (if level sort or level filter is active)
  const levelSortActive = filters.some(f => f.type === "sort" && (f.value === "level_asc" || f.value === "level_desc"));
  const levelFilterActive = filters.some(f => f.type === "level");
  
  let processedSongs = songs;

  // Flatten if needed
  if (levelSortActive || levelFilterActive) {
    processedSongs = songs.flatMap(song => 
      song.difficulties.map(diff => ({
        ...song,
        // Keep only this difficulty
        difficulties: [diff], 
        // Override index to maintain stable sort if needed, though usually we sort by level then index
        // We might want a compound key or just rely on the object identity
      }))
    );
  }

  let result = [...processedSongs];

  // Apply filters
  if (filters.length > 0) {
    result = result.filter(song => {
      // Group filters by type
      const typeFilters = filters.filter(f => f.type === "type");
      const genreFilters = filters.filter(f => f.type === "genre");
      const versionFilters = filters.filter(f => f.type === "addedVersion");
      const levelFilters = filters.filter(f => f.type === "level");

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

      // Level filter (OR within group)
      if (levelFilters.length > 0) {
        const matchesLevel = levelFilters.some(f => {
          // Check if any difficulty matches the level filter
          // If flattened, song.difficulties has only 1 item
          return song.difficulties.some(d => {
            const level = d.levelPrecise / 10;
            const isPlus = level % 1 >= 0.6;
            const baseLevel = Math.floor(level);
            const levelStr = isPlus ? `${baseLevel}+` : `${baseLevel}`;
            return levelStr === f.value;
          });
        });
        if (!matchesLevel) return false;
      }

      return true;
    });
  }

  // Apply sorting
  const sortFilter = filters.find(f => f.type === "sort");
  if (sortFilter) {
    result.sort((a, b) => {
      if (sortFilter.value === "version_desc") {
        if (a.addedVersion !== b.addedVersion) {
          return b.addedVersion - a.addedVersion;
        }
        return b.index - a.index;
      } else if (sortFilter.value === "version_asc") {
        if (a.addedVersion !== b.addedVersion) {
          return a.addedVersion - b.addedVersion;
        }
        return a.index - b.index;
      } else if (sortFilter.value === "level_asc") {
        // Use the first difficulty (since flattened or default logic)
        // If not flattened (should not happen if sort is active), use max or min? 
        // Ideally flattened.
        const levelA = a.difficulties[0]?.levelPrecise ?? 0;
        const levelB = b.difficulties[0]?.levelPrecise ?? 0;
        if (levelA !== levelB) {
          return levelA - levelB;
        }
        return a.index - b.index;
      } else if (sortFilter.value === "level_desc") {
        const levelA = a.difficulties[0]?.levelPrecise ?? 0;
        const levelB = b.difficulties[0]?.levelPrecise ?? 0;
        if (levelA !== levelB) {
          return levelB - levelA;
        }
        return a.index - b.index;
      }
      return 0;
    });
  }

  return result;
}

