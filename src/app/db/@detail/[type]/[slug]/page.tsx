import { SongDetailContent } from "@/components/db/songs/song-detail-content";
import { getAllUniqueSongsCached, getSongDetailsCached } from "@/server/queries/songs-cache";
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ type: string; slug: string }>;
};

// Parallel-route slot rendered alongside `children` for /db/[type]/[slug].
// Currently only the `songs` type emits drawer content; other types have no
// detail-drawer UX, so this returns null for them. The drawer wrapper at
// /db/layout.tsx detects emptiness via `useSelectedLayoutSegments` (length).
export default async function DetailSlotPage({ params }: Props) {
  const { type, slug } = await params;
  if (type !== "songs") return null;

  const decodedSlug = decodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = songs.find((s) => s.slug === decodedSlug);
  if (!song) return null;

  let initialDetails = null;
  try {
    initialDetails = await getSongDetailsCached(song.songName, song.type);
  } catch {
    // Silently fall back to the client-side query inside SongDetailContent.
  }

  const t = await getTranslations("db.songs.detail");
  // Fall back to artist when the song name is empty (some entries have
  // symbol-only or empty `songName`, e.g. `_-x0o0x-dx`) so the
  // accessibility label always names something useful.
  const label = t("detailsFor", { songName: song.songName || song.artist });

  return (
    <article aria-label={label} data-song-slug={song.slug}>
      <SongDetailContent
        songName={song.songName}
        slug={song.slug}
        type={song.type}
        initialData={initialDetails}
      />
    </article>
  );
}
