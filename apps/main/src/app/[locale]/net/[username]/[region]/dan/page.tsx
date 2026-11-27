import { DAN_COURSES, danIndexFromBadge } from "@/components/net/dan/courses";
import styles from "@/components/net/dan/dan.module.css";
import { NetDanRetry } from "@/components/net/dan/net-dan-retry";
import { NetNote, NetPanel, NetSection, NetTitle } from "@/components/net/kit";
import { NetImage } from "@/components/net/net-image";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NetDanPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("dan");
  const snapshot = snapshotData?.snapshot;
  const reached = danIndexFromBadge(snapshot?.courseRankUrl ?? null);

  const badge = (label: string, url: string | null | undefined) => (
    <div className={styles.badge}>
      <span>{label}</span>
      {url ? <NetImage src={url} alt={label} /> : <div className={styles.noBadge}>{t("noBadge")}</div>}
    </div>
  );

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      {!snapshot ? (
        <NetSection>{t("noSnapshot")}</NetSection>
      ) : (
        <>
          <NetPanel heading={t("current")}>
            <div className={styles.badges}>
              {badge(t("course"), snapshot.courseRankUrl)}
              {badge(t("classRank"), snapshot.classRankUrl)}
            </div>
            {reached !== null && reached >= 0 && <div className={styles.reachedName}>{DAN_COURSES[reached]}</div>}
          </NetPanel>
          <NetPanel heading={t("courses")}>
            <div className={styles.grid}>
              {DAN_COURSES.map((name, index) => (
                <div key={name} className={cn(styles.course, reached !== null && index < reached && styles.cleared, index === reached && styles.reached)}>
                  {name}
                  {index === reached && <span className={styles.reachedTag}>{t("reached")}</span>}
                </div>
              ))}
            </div>
            {reached === null && snapshot.courseRankUrl && <NetNote>{t("unknown")}</NetNote>}
          </NetPanel>
        </>
      )}
      <NetDanRetry />
      <NetNote>{t("note")}</NetNote>
    </>
  );
}
