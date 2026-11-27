import { NetTitle } from "@/components/net/kit";
import { NetSecrets } from "@/components/net/secrets/net-secrets";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetSecretsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  await loadNetPlayer(username, region);
  const t = await getNetTranslations("eggs");
  return (
    <>
      <NetTitle>{t("page.title")}</NetTitle>
      <NetSecrets />
    </>
  );
}
