import { NetTitle } from "@/components/net/kit";
import { buildNetRankingBoards } from "@/components/net/ranking/data";
import { NetSongRanking } from "@/components/net/ranking/net-song-ranking";
import { netUpdateDate } from "@/components/net/ranking/update-date";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";

export const dynamic = "force-dynamic";

export default async function NetSongRankingPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, catalog, t] = await Promise.all([
    loadNetPlayer(username, region),
    getAllUniqueSongsCached("maimai"),
    getNetTranslations("ranking"),
  ]);
  const { snapshotData } = player;
  const boards = buildNetRankingBoards(catalog, snapshotData?.songs ?? [], snapshotData?.snapshot.gameVersion ?? Number.MAX_SAFE_INTEGER);

  return (
    <>
      <NetTitle>{t("song.title")}</NetTitle>
      <NetSongRanking boards={boards} playerName={snapshotData?.snapshot.displayName ?? player.username} updated={netUpdateDate()} />
    </>
  );
}
