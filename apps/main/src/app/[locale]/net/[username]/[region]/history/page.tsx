import { NetHistoryList, type NetHistoryRow } from "@/components/net/history/net-history-list";
import { NetRatingGraph } from "@/components/net/history/net-rating-graph";
import { NetEmpty, NetInfo, NetNote, NetTitle } from "@/components/net/kit";
import { NetPaywall } from "@/components/net/net-paywall";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { fetchRatingHistory } from "@/server/queries/rating-history";

export const dynamic = "force-dynamic";

const SHOWN_ROWS = 30;

type HistoryEntry = Awaited<ReturnType<typeof fetchRatingHistory>>["history"][number];

function topSong(entry: HistoryEntry) {
  let best: { song: string; gain: number } | null = null;
  for (const change of entry.changes) {
    const gain = change.newRating - (change.oldRating ?? 0);
    if (!best || gain > best.gain) best = { song: change.songName, gain };
  }
  return best?.song ?? null;
}

export default async function NetHistoryPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { game, profile, snapshotData, region: playerRegion } = await loadNetPlayer(username, region);
  const [t, session] = await Promise.all([getNetTranslations("history"), getServerSession()]);

  // The profile's History tab is owner-only too.
  if (session?.user.id !== profile.id) {
    return (
      <>
        <NetTitle>{t("title")}</NetTitle>
        <NetInfo accent={t("locked.accent")}>{t("locked.info")}</NetInfo>
        <NetEmpty>{t("locked.empty", { name: snapshotData?.snapshot.displayName ?? username })}</NetEmpty>
      </>
    );
  }

  const { history } = await fetchRatingHistory(game.id, profile.id, playerRegion);
  const rows: NetHistoryRow[] = history.map((entry, index) => ({
    date: entry.date.toISOString(),
    rating: entry.rating,
    delta: index > 0 ? entry.rating - history[index - 1].rating : null,
    song: topSong(entry),
  })).reverse();
  const ratings = history.map(entry => entry.rating);

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetInfo accent={t("infoAccent")}>{t("info")}</NetInfo>
      {rows.length === 0 ? (
        <NetEmpty>{t("empty")}</NetEmpty>
      ) : (
        <>
          <NetPaywall feature={t("graph.feature")} requires="premium">
            <NetRatingGraph ratings={ratings} label={t("graph.label", { from: ratings[0], to: ratings[ratings.length - 1] })} />
          </NetPaywall>
          <NetHistoryList rows={rows.slice(0, SHOWN_ROWS)} />
          {rows.length > SHOWN_ROWS && (
            <NetNote>{t("archived.line1", { count: SHOWN_ROWS })}<br />{t("archived.line2")}</NetNote>
          )}
        </>
      )}
    </>
  );
}
