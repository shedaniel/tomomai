import type { LucideIcon } from "lucide-react";
import type { UniqueSong } from "@/components/db/songs/types";

export type PaletteGroup = "calculator" | "charts" | "tips" | "recent" | "songs" | "players" | "events" | "pages" | "minigames" | "posts" | "docs" | "actions";

/** One result of the command palette: a place to go or something to do. */
export type PaletteItem = {
  /** Unique across every group; also what cmdk tracks as the selection. */
  id: string;
  group: PaletteGroup;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  cover?: string;
  /** More words the item answers to, such as a page's other names. */
  keywords?: readonly string[];
  href?: string;
  perform?: () => void;
  /** A song shows its charts, and the viewer's scores on them, in the preview pane. */
  song?: UniqueSong;
  /** The difficulty key of the one chart a chart result stands for. */
  chart?: string;
  /** A player shows their in-game name and rating in the preview pane. */
  player?: { username: string; displayName: string | null; rating: number | null; image: string | null };
  /** Kept in the recent list after it is opened. */
  remember?: boolean;
  /** Left out of the suggestions shown before anything is typed, such as one item per language. */
  searchOnly?: boolean;
  /** Runs without closing the palette, such as picking another random chart. */
  keepOpen?: boolean;
};

/** What the recent list stores of an item, so it can be shown before the catalog loads. */
export type RecentItem = Pick<PaletteItem, "id" | "title" | "subtitle" | "cover" | "href"> & { kind: "song" | "page" | "player" };
