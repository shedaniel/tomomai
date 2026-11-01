import type { LucideIcon } from "lucide-react";
import type { UniqueSong } from "@/components/db/songs/types";

export type PaletteGroup = "recent" | "songs" | "pages" | "actions";

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
  /** A song shows its charts in the preview pane. */
  song?: UniqueSong;
  /** Kept in the recent list after it is opened. */
  remember?: boolean;
  /** Left out of the suggestions shown before anything is typed, such as one item per language. */
  searchOnly?: boolean;
};

/** What the recent list stores of an item, so it can be shown before the catalog loads. */
export type RecentItem = Pick<PaletteItem, "id" | "title" | "subtitle" | "cover" | "href"> & { kind: "song" | "page" };
