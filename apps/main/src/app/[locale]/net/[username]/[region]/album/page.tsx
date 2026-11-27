import { NetAlbumCard, NetAlbumPhoto, NetAlbumResultMock } from "@/components/net/album/net-album-card";
import { netDifficulty } from "@/components/net/difficulty";
import { NetButtonLink, NetEmpty, NetInfo, NetNote, NetTitle } from "@/components/net/kit";
import { NetCameraArt, NetLockArt, NetPinArt } from "@/components/net/net-art";
import { NetPlayTime } from "@/components/net/records/net-play-time";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { defaultFlags } from "@/lib/flags";
import { hasCapability } from "@/lib/games/access";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { fetchUserAlbums } from "@/server/queries/albums";

export const dynamic = "force-dynamic";

/** DX NET keeps a player's 10 most recent photos, so tomomai NET shows the same 10. */
const ALBUM_LIMIT = 10;
const JUDGEMENTS = ["critical", "tap", "perfect", "hold", "great", "slide", "miss", "break"] as const;

export default async function NetAlbumPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, session, t, common] = await Promise.all([
    loadNetPlayer(username, region),
    getServerSession(),
    getNetTranslations("album"),
    getNetTranslations("common"),
  ]);
  const { game, profile } = player;
  // Albums are owner-only on the profile too, there is no privacy setting that publishes them.
  const isOwner = session?.user.id === profile.id;

  if (!hasCapability(game.id, "albums", player.region) || !defaultFlags.albumsCard) {
    return <><NetTitle>{t("title")}</NetTitle><NetEmpty>{t("unsupported")}</NetEmpty></>;
  }

  if (!isOwner) {
    return (
      <>
        <NetTitle>{t("title")}</NetTitle>
        <NetInfo accent={t("locked.accent")}>{t("locked.body")}</NetInfo>
        <NetAlbumCard difficulty="master" difficultyLabel={common("difficulties.master")} songName={t("locked.songName")}>
          <NetAlbumResultMock
            icon={<NetLockArt size={48} />}
            frameText={t("locked.frame")}
            difficultyLine={`${common("difficulties.master")}  LV ??`}
            songName={t("locked.songName")}
            achievement={["???.", "????%"]}
            judgements={JUDGEMENTS.map(key => ({ label: t(`judgements.${key}`), value: "?" }))}
            footer={t("locked.footer")}
          />
        </NetAlbumCard>
      </>
    );
  }

  const { albums, hasMore } = await fetchUserAlbums(game.id, profile.id, player.region, ALBUM_LIMIT, 0);

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetInfo accent={t("info.accent")}>{t("info.body", { limit: ALBUM_LIMIT })}</NetInfo>
      {albums.length === 0 ? (
        <>
          <NetAlbumCard difficulty="expert" difficultyLabel={common("difficulties.expert")} songName={t("empty.songName")}>
            <NetAlbumResultMock
              icon={<NetCameraArt size={48} />}
              frameText={t("empty.frame")}
              difficultyLine={`${common("difficulties.expert")}  LV 13`}
              songName={t("empty.songName")}
              achievement={["0.", "0000%"]}
              judgements={JUDGEMENTS.map(key => ({ label: t(`judgements.${key}`), value: 0 }))}
              footer={t("empty.footer")}
              style={{ filter: "grayscale(1)", opacity: 0.6 }}
            />
          </NetAlbumCard>
          <NetEmpty>{t("empty.body")}</NetEmpty>
        </>
      ) : albums.map(album => {
        const difficulty = netDifficulty(album.difficultyCode);
        return (
          <NetAlbumCard
            key={album.id}
            difficulty={difficulty}
            difficultyLabel={common(`difficulties.${difficulty}`)}
            songName={album.songName}
            takenAt={<NetPlayTime at={album.takenAt} />}
            footer={album.venue ? <><NetPinArt size={12} /><span>{album.venue}</span></> : undefined}
          >
            <NetAlbumPhoto src={`${process.env.NEXT_PUBLIC_R2_URL}/${album.imageKey}`} alt={album.songName} />
          </NetAlbumCard>
        );
      })}
      {albums.length > 0 && (
        <NetNote>
          {t("note.limit", { limit: ALBUM_LIMIT })}
          {hasMore && (
            <>
              <br />{t("note.more")}<br /><br />
              <NetButtonLink href={`/profile/${encodeURIComponent(player.username)}/${player.region}?tab=albums`}>{t("note.all")}</NetButtonLink>
            </>
          )}
        </NetNote>
      )}
    </>
  );
}
