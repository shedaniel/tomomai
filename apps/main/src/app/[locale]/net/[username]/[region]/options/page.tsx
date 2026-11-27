import { NetNote, NetTitle } from "@/components/net/kit";
import { NetOptions } from "@/components/net/options/net-options";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetOptionsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  await loadNetPlayer(username, region);
  const t = await getNetTranslations("options");

  return (
    <>
      <NetTitle>{t("title")}</NetTitle>
      <NetOptions />
      <NetNote>{t("note")}</NetNote>
    </>
  );
}
