import { notFound } from "next/navigation";
import { PARENT_PUBLIC_ID_PATTERN, parentPublicIdOf } from "@tomomai/games/song-ids";
import type { SongDetailChart, SongDetailHistoricalChart, SongDetails } from "@/components/db/songs/types";
import { NetEmpty, NetTitle } from "@/components/net/kit";
import { NetSongDetail, type NetSongDetailChart } from "@/components/net/song-detail/net-song-detail";
import { setStaticLocale } from "@/i18n/locale-server";
import { getServerSession } from "@/lib/auth-server";
import { hasCapability } from "@/lib/games/access";
import { codeOf, isCodeKey, keyOf } from "@/lib/games/codes";
import { calculateDXStars } from "@/lib/games/maimai/score-details";
import { maimaiVersionTable } from "@/lib/games/maimai/versions";
import type { GamePlayerScore } from "@/lib/games/player-view";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";
import { fetchNetSongPlays, type NetChartPlays } from "@/lib/net/song-detail";
import { querySongDetails } from "@/server/queries/songs";
import { getAllUniqueSongsCached } from "@/server/queries/songs-cache";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: string; username: string; region: string; songId: string }> };

const hasNoteCounts = (chart: SongDetailChart | SongDetailHistoricalChart): chart is SongDetailChart => "tapCount" in chart;

/** The region's chart data as of the snapshot's version, falling back to the newest the region has. */
function regionalCharts(details: SongDetails | null, region: string, gameVersion: number | undefined) {
  const versions = details?.regions.find(entry => entry.region === region)?.versions ?? [];
  const version = (gameVersion != null ? versions.find(entry => entry.gameVersion <= gameVersion) : undefined) ?? versions[0];
  return new Map<string, SongDetailChart | SongDetailHistoricalChart>((version?.charts ?? []).map(chart => [chart.difficulty, chart]));
}

function maxDxScoreOf(chart: SongDetailChart | SongDetailHistoricalChart | undefined): number | null {
  if (!chart || !hasNoteCounts(chart)) return null;
  const counts = [chart.tapCount, chart.holdCount, chart.slideCount, chart.touchCount, chart.breakCount];
  return counts.every(count => count != null) ? counts.reduce((sum: number, count) => sum + count!, 0) * 3 : null;
}

export default async function NetSongDetailPage({ params }: Params) {
  const { locale, username, region, songId } = await params;
  await setStaticLocale(locale);
  if (!PARENT_PUBLIC_ID_PATTERN.test(songId)) notFound();

  const [player, session, t, catalog] = await Promise.all([
    loadNetPlayer(username, region),
    getServerSession(),
    getNetTranslations("songDetail"),
    getAllUniqueSongsCached("maimai"),
  ]);
  const { game, profile, snapshotData } = player;
  const backHref = netPagePath(player.base, "songs");

  const catalogSong = catalog.find(song => song.parentIds.includes(songId));
  const parentIds = new Set(catalogSong?.parentIds ?? [songId]);
  const scores = (snapshotData?.songs ?? []).filter(score => parentIds.has(parentPublicIdOf(score.songId)));
  // A chart only the player's scores know, such as one the catalog dropped, still gets a page.
  const fallback: GamePlayerScore | undefined = scores[0];
  if (!catalogSong && !fallback) notFound();

  if (!snapshotData) {
    return <><NetTitle>{t("title")}</NetTitle><NetEmpty>{t("noSnapshot")}</NetEmpty></>;
  }

  const songName = catalogSong?.songName ?? fallback!.songName;
  const artist = catalogSong?.artist ?? fallback!.artist;
  const typeCode = catalogSong && isCodeKey("maimai", "chartType", catalogSong.type)
    ? codeOf("maimai", "chartType", catalogSong.type)
    : fallback?.typeCode ?? 0;
  const playsVisible = hasCapability(game.id, "recents", player.region)
    && (session?.user.id === profile.id || PUBLIC_VIEWS.recentPlays(profile));

  const [details, plays] = await Promise.all([
    querySongDetails({ game: "maimai", songName, type: keyOf("maimai", "chartType", typeCode), artist, parentIds: [...parentIds] })
      .catch(() => null),
    playsVisible
      ? fetchNetSongPlays(profile.id, player.region, [...parentIds], snapshotData.snapshot.fetchedAt)
      : Promise.resolve(new Map<number, NetChartPlays>()),
  ]);

  const regional = regionalCharts(details, player.region, snapshotData.snapshot.gameVersion);
  const scoreByDifficulty = new Map(scores.map(score => [score.difficultyCode, score]));
  const difficulties = new Map<number, string>();
  for (const chart of catalogSong?.difficulties ?? []) {
    if (isCodeKey("maimai", "difficulty", chart.difficulty)) difficulties.set(codeOf("maimai", "difficulty", chart.difficulty), chart.level);
  }
  for (const score of scores) if (!difficulties.has(score.difficultyCode)) difficulties.set(score.difficultyCode, score.level);

  const charts: NetSongDetailChart[] = [...difficulties].sort(([a], [b]) => a - b).map(([difficultyCode, catalogLevel]) => {
    const chart = regional.get(keyOf("maimai", "difficulty", difficultyCode));
    const score = scoreByDifficulty.get(difficultyCode);
    const maxDxScore = maxDxScoreOf(chart);
    const played = plays.get(difficultyCode);
    return {
      difficultyCode,
      level: chart && hasNoteCounts(chart) ? chart.level : score?.level ?? catalogLevel,
      constant: chart ? (chart.levelPrecise / 10).toFixed(1) : null,
      estimated: chart?.levelPreciseEstimated ?? false,
      maxDxScore,
      stars: score?.secondaryScore != null && maxDxScore ? calculateDXStars(score.secondaryScore, maxDxScore) : 0,
      score: score
        ? { scoreValue: score.scoreValue, secondaryScore: score.secondaryScore, comboStatus: score.comboStatus, syncStatus: score.syncStatus }
        : null,
      plays: played ? { lastPlayedAt: played.lastPlayedAt.toISOString(), count: played.count } : null,
    };
  });

  const addedVersion = catalogSong?.addedVersion ?? fallback!.addedVersion;
  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetSongDetail
        song={{
          name: songName,
          artist,
          cover: catalogSong?.cover ?? fallback!.cover,
          genre: catalogSong?.genre ?? fallback!.genre,
          typeCode,
          version: maimaiVersionTable.get(addedVersion)?.name ?? null,
          bpm: details?.bpm ?? null,
        }}
        charts={charts}
        playsHidden={!playsVisible}
        playerName={snapshotData.snapshot.displayName}
        backHref={backHref}
      />
    </>
  );
}
