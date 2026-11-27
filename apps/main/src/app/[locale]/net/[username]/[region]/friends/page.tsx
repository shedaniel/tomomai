import { netFriendCode, netPick } from "@/components/net/friends/friend-code";
import { NetAimeNote } from "@/components/net/friends/net-aime-note";
import { NetAiFriendCard } from "@/components/net/friends/net-friend-card";
import { NetFriendCodeButton } from "@/components/net/friends/net-friend-code";
import { bold } from "@/components/net/friends/bold";
import styles from "@/components/net/friends/friends.module.css";
import { NetNote, NetPanel, NetTitle } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const ROASTS = 5;

export default async function NetFriendsPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const [player, t] = await Promise.all([loadNetPlayer(username, region), getNetTranslations("friends")]);
  const snapshot = player.snapshotData?.snapshot;
  const roast = snapshot
    ? t(`ai.roasts.${netPick(player.username, ROASTS)}`, { name: snapshot.displayName, rating: snapshot.rating })
    : t("ai.noData");

  return (
    <>
      <NetTitle>{t("list.title")}</NetTitle>
      <NetFriendCodeButton code={netFriendCode(player.username)} />
      <div className={styles.counts}>
        <div>{t("list.friends")}<br /><b>1</b><small>/100</small></div>
        <div>{t("list.favorites")}<br /><b>0</b><small>/20</small></div>
        <div>{t("list.rivals")}<br /><b>0</b><small>/3</small></div>
      </div>
      <NetAiFriendCard roast={roast} playerRating={snapshot?.rating ?? null} shopHref={netPagePath(player.base, "shop")} />
      <NetPanel heading={t("list.requestsTitle")}>
        <p className={styles.requests}>{t.rich("list.requests", { b: bold })}</p>
        <NetAimeNote note={t("list.requestsNote")} link={t("list.requestsNoteLink")} />
      </NetPanel>
      <NetNote>{t("list.note")}</NetNote>
    </>
  );
}
