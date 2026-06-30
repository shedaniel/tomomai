import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";

/**
 * Server-rendered, crawler-facing list of song links for the /db/songs route.
 *
 * SongsList (the interactive grid) lives in the shared /db/[type]/layout and
 * is client-fetched via tRPC — so song cards are NOT in the initial HTML.
 * This component puts real, crawlable song names + detail-page links in the
 * SSR document so the catalog stays indexable. It's hidden client-side once
 * the interactive grid hydrates (SongsList sets `hidden` on it on mount).
 *
 * Rendered only by the list page, so it never leaks onto /db/songs/[slug].
 */
export async function SongListSeo() {
  const songs = await getAllUniqueSongsCached();
  return (
    <ul id="songs-seo-list" className="sr-only">
      {songs.map((song) => (
        <li key={`${song.slug}-${song.type}`}>
          <a href={`/db/songs/${encodeURIComponent(song.slug)}`}>
            {song.songName || song.artist}
          </a>
        </li>
      ))}
    </ul>
  );
}
