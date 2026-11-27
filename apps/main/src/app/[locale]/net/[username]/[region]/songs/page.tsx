import { NetEmpty, NetTitle } from "@/components/net/kit";
import { buildNetSongs } from "@/components/net/songs/data";
import { NetSongScores } from "@/components/net/songs/net-song-scores";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";

export const dynamic = "force-dynamic";

export default async function NetSongsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("songs");

  if (!snapshotData) {
    return (
      <>
        <NetTitle>{t("title")}</NetTitle>
        <NetEmpty>{t("noSnapshot")}</NetEmpty>
      </>
    );
  }

  const catalog = await getAllUniqueSongsCached("maimai");
  const songs = buildNetSongs(catalog, snapshotData.songs, snapshotData.snapshot.gameVersion);

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetSongScores songs={songs} base={base} />
    </>
  );
}
