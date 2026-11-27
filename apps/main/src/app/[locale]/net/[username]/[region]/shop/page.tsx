import { NetInfo, NetNote, NetTitle } from "@/components/net/kit";
import { NetCourses } from "@/components/net/shop/net-courses";
import styles from "@/components/net/shop/shop.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetShopPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const player = await loadNetPlayer(username, region);
  const t = await getNetTranslations("shop");

  return (
    <>
      <div className={styles.chips}><span>{t("tomomile", { count: 0 })}</span></div>
      <NetTitle>{t("title")}</NetTitle>
      <NetInfo accent={t("introAccent")}>{t("intro")}</NetInfo>
      <NetCourses homePath={player.base} profilePath={`/profile/${encodeURIComponent(player.username)}/${player.region}`} />
      <NetNote>{t("fineprint")}</NetNote>
    </>
  );
}
