import { FilterCategory } from "@/components/filter-panel";
import { getVersionInfo } from "@tomomai/catalog/metadata";
import { Disc3, Folder, Calendar, ArrowUpDown, BarChart, Pencil } from "lucide-react";
import { GroupMode, UniqueSong, UniqueSongDifficulty, UniqueSongFilter } from "./types";
import { LEVEL_ENUM } from "@/lib/db/types";

export type UniqueSongFlattened = Omit<UniqueSong, "difficulties"> & {
  difficulties: (UniqueSongDifficulty & { noteDesignerNumber: number })[];
}

export function hashString(str: string | null): number {
  if (!str) return 0;
  // Simple hash function for compacting filter strings
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

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

  // Get unique note designers from songs, sorted by amount of songs using them
  const noteDesignersToAmount: Record<string, number> = {};
  for (const song of songs) {
    for (const difficulty of song.difficulties) {
      if (difficulty.noteDesigner) {
        noteDesignersToAmount[difficulty.noteDesigner] = (noteDesignersToAmount[difficulty.noteDesigner] ?? 0) + 1;
      }
    }
  }
  const noteDesigners = Object.entries(noteDesignersToAmount).sort((a, b) => b[1] - a[1]).map(([designer]) => designer);

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
    {
      type: "noteDesigner",
      label: getLabel("noteDesigner", "Note Designer"),
      icon: Pencil,
      options: noteDesigners.map(d => ({ value: hashString(d).toString(), label: d })),
    },
  ];
}

// Apply filters to unique songs
export function applyUniqueSongFilters(allSongs: UniqueSong[], flattenedSongs: UniqueSongFlattened[], filters: UniqueSongFilter[], groupMode: GroupMode = "none"): UniqueSong[] {
  // Check if we need to flatten songs (if level sort or level filter is active)
  const levelSortActive = filters.some(f => f.type === "sort" && (f.value === "level_asc" || f.value === "level_desc"));
  const levelFilterActive = filters.some(f => f.type === "level");
  const noteDesignerFilterActive = filters.some(f => f.type === "noteDesigner");
  // Group by level implies distinct by difficulty mode
  const levelGroupActive = groupMode === "level_asc" || groupMode === "level_desc";
  const chartDesignerGroupActive = groupMode === "noteDesigner";
  // Group filters by type
  const typeFilters = filters.filter(f => f.type === "type");
  const genreFilters = filters.filter(f => f.type === "genre");
  const versionFilters = filters.filter(f => f.type === "addedVersion");
  const levelFilters = filters.filter(f => f.type === "level").map(f => ({ ...f, value: f.value.endsWith("+") ? Number(f.value.replace("+", "6")) : Number(f.value + "0") }));
  const noteDesignerFilters = filters.filter(f => f.type === "noteDesigner").map(f => ({ ...f, value: Number(f.value) }));

  let processedSongs = allSongs;

  // Flatten if needed
  if (levelSortActive || levelFilterActive || noteDesignerFilterActive || levelGroupActive || chartDesignerGroupActive) {
    processedSongs = flattenedSongs;
  }

  let result = [...processedSongs];

  // Apply filters
  if (filters.length > 0) {
    result = result.filter(song => {
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
            const levelStr = isPlus ? baseLevel * 10 + 6 : baseLevel * 10;
            return levelStr === f.value;
          });
        });
        if (!matchesLevel) return false;
      }

      // Note designer filter (OR within group)
      if (noteDesignerFilters.length > 0) {
        const matchesNoteDesigner = noteDesignerFilters.some(f => (song.difficulties[0] as UniqueSongDifficulty & { noteDesignerNumber: number }).noteDesignerNumber === f.value);
        if (!matchesNoteDesigner) return false;
      }

      return true;
    });
  }

  // Apply sorting
  const sortFilter = filters.find(f => f.type === "sort");

  // Apply Group sorting first, then Filter sorting
  // Actually, if Grouping is active, it dictates the primary sort order.
  // The user might expect the "Sort" filter to apply within the group?
  // Let's sort by Group criteria first.

  if (groupMode !== "none") {
    result.sort((a, b) => {
      let comparison = 0;
      switch (groupMode) {
        case "noteDesigner":
          // Empty/Null designers go last
          comparison = (a.difficulties[0]?.noteDesigner ?? "").localeCompare(b.difficulties[0]?.noteDesigner ?? "");
          if (!a.difficulties[0]?.noteDesigner && b.difficulties[0]?.noteDesigner) comparison = 1;
          if (a.difficulties[0]?.noteDesigner && !b.difficulties[0]?.noteDesigner) comparison = -1;
          break;
        case "level_asc": {
          const levelA = a.difficulties[0]?.levelPrecise ?? 0;
          const levelB = b.difficulties[0]?.levelPrecise ?? 0;
          comparison = levelA - levelB;
          break;
        }
        case "level_desc": {
          const levelA = a.difficulties[0]?.levelPrecise ?? 0;
          const levelB = b.difficulties[0]?.levelPrecise ?? 0;
          comparison = levelB - levelA;
          break;
        }
        case "version_asc":
          comparison = a.addedVersion - b.addedVersion;
          break;
        case "version_desc":
          comparison = b.addedVersion - a.addedVersion;
          break;
        case "genre":
          comparison = a.genre.localeCompare(b.genre);
          break;
        case "artist":
          comparison = a.artist.localeCompare(b.artist);
          break;
      }

      // If group is same, use secondary sort (from filter or default index)
      if (comparison !== 0) return comparison;

      // Secondary sort logic (copying from below)
      if (sortFilter) {
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
          const levelA = a.difficulties[0]?.levelPrecise ?? 0;
          const levelB = b.difficulties[0]?.levelPrecise ?? 0;
          if (levelA !== levelB) return levelA - levelB;
          return a.index - b.index;
        } else if (sortFilter.value === "level_desc") {
          const levelA = a.difficulties[0]?.levelPrecise ?? 0;
          const levelB = b.difficulties[0]?.levelPrecise ?? 0;
          if (levelA !== levelB) return levelB - levelA;
          return a.index - b.index;
        }
      }

      // Default fallback
      return a.index - b.index;
    });
  } else if (sortFilter) {
    // Standard sorting if no group mode
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
