import { NetButtonLink, NetTitle } from "@/components/net/kit";
import { NetSerialForm } from "@/components/net/serial/net-serial-form";
import styles from "@/components/net/serial/serial.module.css";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

export default async function NetSerialPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { base, snapshotData } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("serial");

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetSerialForm rating={snapshotData?.snapshot?.rating ?? null} />
      <div className={styles.back}><NetButtonLink href={netPagePath(base, "shop")}>{t("back")}</NetButtonLink></div>
    </>
  );
}
