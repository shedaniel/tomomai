import { NetButtonLink, NetEmpty, NetInfo, NetNote, NetTitle } from "@/components/net/kit";
import { NetRecordCard } from "@/components/net/net-record-card";
import { NetPaywall } from "@/components/net/net-paywall";
import { NetPlayTime } from "@/components/net/records/net-play-time";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { hasCapability } from "@/lib/games/access";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { netRecordDetailPath } from "@/lib/net/routes";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { fetchRecentSongs } from "@/server/queries/recents";

/** DX NET shows 50 plays. tomomai NET shows 3, and sells the rest. */
const FREE_TRACKS = 3;

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 50;

export default async function NetRecordsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, session, t] = await Promise.all([
    loadNetPlayer(username, region),
    getServerSession(),
    getNetTranslations("records"),
  ]);
  const { game, profile, snapshotData } = player;
  const visible = session?.user.id === profile.id || PUBLIC_VIEWS.recentPlays(profile);

  if (!hasCapability(game.id, "recents", player.region)) {
    return <><NetTitle>{t("title")}</NetTitle><NetEmpty>{t("unsupported")}</NetEmpty></>;
  }
  if (!visible) {
    return (
      <>
        <NetTitle>{t("title")}</NetTitle>
        <NetInfo accent={t("hidden.accent")}>{t("hidden.body")}</NetInfo>
        <NetEmpty>{t("hidden.empty")}</NetEmpty>
      </>
    );
  }

  // Same cut-off as the profile's Recent Plays tab, which reads up to the published snapshot.
  const { recentPlays, totalCount } = await fetchRecentSongs(
    game.id, profile.id, player.region, RECENT_LIMIT, 0, snapshotData?.snapshot.fetchedAt,
  );
  const hiddenCount = Math.max(totalCount - recentPlays.length, 0);

  const renderPlay = (play: (typeof recentPlays)[number]) => (
        <NetRecordCard
          key={play.recentSongId}
          score={{
            songName: play.songName, cover: play.cover, level: play.level, difficultyCode: play.difficultyCode, typeCode: play.typeCode,
            scoreValue: play.scoreValue, secondaryScore: play.secondaryScore, comboStatus: play.comboStatus, syncStatus: play.syncStatus,
          }}
          track={t("track", { track: String(play.track).padStart(2, "0") })}
          playedAt={<NetPlayTime at={play.playedAt} />}
          maxDxScore={play.details.game === "maimai" ? play.details.maxDxScore || null : null}
          action={<NetButtonLink href={netRecordDetailPath(player.base, play.recentSongId)}>{t("details")}</NetButtonLink>}
        />
  );

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      {recentPlays.length === 0 ? (
        <NetEmpty>{t("empty")}</NetEmpty>
      ) : (
        <>
          {recentPlays.slice(0, FREE_TRACKS).map(renderPlay)}
          {recentPlays.length > FREE_TRACKS && (
            <NetPaywall feature={t("lockedFeature", { from: FREE_TRACKS + 1, to: recentPlays.length })}>
              {recentPlays.slice(FREE_TRACKS).map(renderPlay)}
            </NetPaywall>
          )}
        </>
      )}
      <NetNote>
        {t("note", { limit: RECENT_LIMIT })}
        {hiddenCount > 0 && <><br />{t("noteMore", { count: hiddenCount })}</>}
      </NetNote>
    </>
  );
}
