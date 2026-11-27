import { NetStaffRoll } from "@/components/net/hidden/net-staff-roll";
import { NetButtonLink, NetTitle } from "@/components/net/kit";
import styles from "@/components/net/hidden/hidden.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetCreditsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("home")]);
  return (
    <>
      <NetTitle>{t("hidden.credits.title")}</NetTitle>
      <NetStaffRoll starring={player.snapshotData?.snapshot.displayName ?? player.username} />
      <div className={styles.actions}><NetButtonLink href={player.base}>{t("hidden.notFound.home")}</NetButtonLink></div>
    </>
  );
}
