import { NetEmpty, NetNote, NetTitle } from "@/components/net/kit";
import { NetPlateCard, type NetPlateData } from "@/components/net/plates/net-plate-card";
import { NetPlateList, type NetPlateGroup } from "@/components/net/plates/net-plate-list";
import { computeVersionPlates, pickShowcasePlate, type VersionPlateProgress } from "@/components/net/plates/plate-progress";
import styles from "@/components/net/plates/plates.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { PUBLIC_VIEWS } from "@/lib/games/public-player";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const SPECIAL_GROUP = "special";

export default async function NetPlatesPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const player = await loadNetPlayer(username, region);
  const { profile, snapshotData, base } = player;
  const t = await getNetTranslations("plates");

  const showVersionPlates = !!snapshotData && PUBLIC_VIEWS.plates(profile);
  const versionPlates = showVersionPlates
    ? await computeVersionPlates(snapshotData.songs, player.region, snapshotData.snapshot.gameVersion)
    : [];

  const toPlate = (plate: VersionPlateProgress): NetPlateData => {
    const name = `${plate.versionName} ${t(`types.${plate.plate}`)}`;
    return {
      id: `${plate.versionId}-${plate.plate}`,
      group: String(plate.versionId),
      tag: t("tags.version"),
      name,
      condition: t(`conditions.${plate.plate}`, { version: plate.versionName }),
      banner: name,
      tone: plate.plate,
      earned: plate.earned,
      progress: {
        label: t("progress", { done: plate.done, total: plate.total }),
        ratio: plate.total ? plate.done / plate.total : 0,
      },
    };
  };

  const jokePlates: NetPlateData[] = [
    { id: "login", group: SPECIAL_GROUP, tag: t("tags.login"), name: t("jokes.login.name"), condition: t("jokes.login.condition"), banner: t("jokes.login.banner"), tone: "login", earned: true },
    { id: "april", group: SPECIAL_GROUP, tag: t("tags.event"), name: t("jokes.april.name"), condition: t("jokes.april.condition"), banner: t("jokes.april.banner"), tone: "april", earned: true },
    {
      id: "course", group: SPECIAL_GROUP, tag: t("tags.shop"), name: t("jokes.course.name"), condition: t("jokes.course.condition"), banner: t("jokes.course.banner"),
      tone: "course", earned: false, href: netPagePath(base, "shop"), hrefLabel: t("jokes.course.cta"),
    },
  ];

  const showcase = pickShowcasePlate(versionPlates);
  const current = showcase ? toPlate(showcase) : jokePlates[0];
  const plates = [...jokePlates, ...versionPlates.map(toPlate)];

  const groups: NetPlateGroup[] = [{ id: SPECIAL_GROUP, label: t("groups.special") }];
  for (const plate of versionPlates) {
    const id = String(plate.versionId);
    if (groups.at(-1)?.id !== id) groups.push({ id, label: t("groups.version", { version: plate.versionName }) });
  }

  return (
    <>
      <section className={`${styles.box} ${styles.setting}`}>
        <h5 className={styles.boxHeading}>{t("setting")}</h5>
        <NetPlateCard plate={{ ...current, progress: undefined }} stamp={t("usingCurrently")} lockedLabel={t("locked")} />
      </section>
      <div className={styles.chips}>
        <span>{t("favorite", { count: 1 })}</span>
        <span>{t("count", { count: plates.filter(plate => plate.earned).length })}</span>
      </div>
      <NetTitle>{t("title")}</NetTitle>
      {!showVersionPlates && <NetEmpty>{snapshotData ? t("hidden") : t("noSnapshot")}</NetEmpty>}
      <NetPlateList groups={groups} plates={plates} />
      {showVersionPlates && <NetNote>{t("note")}</NetNote>}
    </>
  );
}
