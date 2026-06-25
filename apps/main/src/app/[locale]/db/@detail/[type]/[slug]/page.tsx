import { SongDetailContent } from "@/components/db/songs/song-detail-content";
import { getAllUniqueSongsCached, getSongDetailsCached } from "@/server/queries/songs-cache";
import { getTranslations } from "next-intl/server";

// Match the parent [slug] route's ISR mode.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
}

type Props = {
  params: Promise<{ type: string; slug: string }>;
};

export default async function DetailSlotPage({ params }: Props) {
  const { type, slug } = await params;
  if (type !== "songs") return null;

  const decodedSlug = decodeURIComponent(slug);
  const songs = await getAllUniqueSongsCached();
  const song = songs.find((s) => s.slug === decodedSlug);
  if (!song) return null;

  // SSR the full static chart data (no userId → no scores) so the drawer
  // body is in the document for crawlers and no-JS clients. The client
  // component refetches on mount to layer in the signed-in user's scores.
  const details = await getSongDetailsCached(song.songName, song.type);

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
        initialData={details}
      />
    </article>
  );
}
