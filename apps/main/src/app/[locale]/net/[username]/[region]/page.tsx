import { Link } from "@/i18n/navigation";
import homeStyles from "@/components/net/home/home.module.css";
import { NetLoginLink } from "@/components/net/home/net-login-link";
import { NetMenuList, type NetMenuGroup } from "@/components/net/home/net-menu-list";
import { NetGearArt } from "@/components/net/net-art";
import { NetEmpty } from "@/components/net/kit";
import { NetProfileCard, NetProfileComment } from "@/components/net/net-profile-card";
import { NetPremiumNudge } from "@/components/net/premium/net-premium-nudge";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

export default async function NetHomePage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("home");
  const path = (page: Parameters<typeof netPagePath>[1]) => netPagePath(base, page);

  const groups: NetMenuGroup[] = [
    {
      label: t("menu.home"), section: "home",
      links: [
        { label: t("menu.links.home"), href: path("home") },
        { label: t("menu.links.rating"), href: path("rating") },
        { label: t("menu.links.history"), href: path("history") },
      ],
    },
    {
      label: t("menu.playData"), section: "playData",
      links: [
        { label: t("menu.links.playData"), href: path("playData") },
        { label: t("menu.links.stampCard"), href: path("stampCard") },
        { label: t("menu.links.album"), href: path("album") },
      ],
    },
    {
      label: t("menu.friends"), section: "friends",
      links: [
        { label: t("menu.links.friends"), href: path("friends") },
        { label: t("menu.links.friendSearch"), href: path("friendSearch") },
        { label: t("menu.links.circle"), href: path("circle") },
      ],
    },
    {
      label: t("menu.records"), section: "records",
      links: [
        { label: t("menu.links.gameRecord"), href: path("records") },
        { label: t("menu.links.songScore"), href: path("songs") },
        { label: t("menu.links.dan"), href: path("dan") },
        { label: t("menu.links.worldStats"), href: path("worldStats") },
        { label: t("menu.links.olderRecords"), href: `${base}/older-records`, joke: true },
      ],
    },
    {
      label: t("menu.collection"), section: "collection",
      links: [
        { label: t("menu.links.icon"), href: path("icon") },
        { label: t("menu.links.namePlate"), href: path("plates") },
        { label: t("menu.links.frame"), href: path("frame") },
        { label: t("menu.links.title"), href: path("title") },
        { label: t("menu.links.partner"), href: path("partner") },
      ],
    },
    {
      label: t("menu.event"), section: "event",
      links: [
        { label: t("menu.links.area"), href: path("area") },
        { label: t("menu.links.eventArea"), href: path("eventArea") },
        { label: t("menu.links.season"), href: path("season") },
      ],
    },
    {
      label: t("menu.ranking"), section: "ranking",
      links: [
        { label: t("menu.links.songRanking"), href: path("ranking") },
        { label: t("menu.links.ratingRanking"), href: path("ratingRanking") },
      ],
    },
    {
      label: t("menu.shop"), section: "shop",
      links: [
        { label: t("menu.links.tomomile"), href: path("shop") },
        { label: t("menu.links.serial"), href: path("serial") },
        { label: t("menu.links.standardCourse"), href: path("shop"), joke: true },
        { label: t("menu.links.premiumCourse"), href: path("shop"), joke: true },
      ],
    },
  ];

  return (
    <>
      {snapshotData ? (
        <NetProfileCard
          snapshot={snapshotData.snapshot}
          footer={(
            <NetProfileComment>
              {t("comment.line1")}<br /><NetLoginLink>{t("comment.line2")}</NetLoginLink><br />
              <span style={{ color: "#999" }}>{t("comment.line3")}</span>
            </NetProfileComment>
          )}
        />
      ) : (
        <NetEmpty>{t("noSnapshot")}</NetEmpty>
      )}
      <div className={homeStyles.buttons}>
        <Link href={path("options")} className={homeStyles.options}><NetGearArt size={22} /> {t("options")} <big>{t("optionsBig")}</big></Link>
        <br />
        <Link href={path("shop")} className={homeStyles.course}>{t("standardCourse")}</Link>
      </div>
      <NetMenuList groups={groups} />
      <NetPremiumNudge />
    </>
  );
}
