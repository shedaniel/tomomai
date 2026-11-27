import { netFriendCode } from "@/components/net/friends/friend-code";
import { NetCopyButton } from "@/components/net/friends/net-friend-code";
import { NetFriendSearch } from "@/components/net/friends/net-friend-search";
import styles from "@/components/net/friends/friends.module.css";
import { NetPanel, NetTitle } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetFriendSearchPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("friends")]);
  const code = netFriendCode(player.username);
  const snapshot = player.snapshotData?.snapshot;

  return (
    <>
      <NetTitle>{t("search.title")}</NetTitle>
      <NetFriendSearch ownCode={code} ownName={snapshot?.displayName ?? player.username} ownRating={snapshot?.rating ?? null} />
      <NetPanel heading={t("search.yourCode")}>
        <div className={styles.codeBox}>
          <div className={styles.code}>{code}</div>
          <NetCopyButton text={code}>{t("list.copy")}</NetCopyButton>
          <p>{t("search.yourCodeNote")}</p>
        </div>
      </NetPanel>
    </>
  );
}
