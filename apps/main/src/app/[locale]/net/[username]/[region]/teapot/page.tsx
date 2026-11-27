import { NetTeapotMachine } from "@/components/net/hidden/net-teapot";
import styles from "@/components/net/hidden/hidden.module.css";
import { NetButtonLink, NetTitle } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetTeapotPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [{ base }, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("home")]);
  return (
    <>
      <NetTitle>{t("hidden.teapot.title")}</NetTitle>
      <section className={styles.error}>
        <div className={styles.code}>{t("hidden.teapot.code")}</div>
        <NetTeapotMachine screen={t("hidden.teapot.screen")} />
        <div className={styles.actions}><NetButtonLink href={base}>{t("hidden.notFound.home")}</NetButtonLink></div>
      </section>
    </>
  );
}
