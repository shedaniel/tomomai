import { FilterCategory } from "@/components/filter-panel";
import { getVersionInfo } from "@/lib/metadata";
import { Disc3, Folder, Calendar } from "lucide-react";
import { UniqueSong, UniqueSongFilter } from "./types";

// Create filter categories for unique songs
export function createUniqueSongFilterCategories(songs: UniqueSong[]): FilterCategory[] {
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
export function applyUniqueSongFilters(songs: UniqueSong[], filters: UniqueSongFilter[]): UniqueSong[] {
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

