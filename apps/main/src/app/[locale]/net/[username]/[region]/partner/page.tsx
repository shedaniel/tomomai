import { NetCollectionIcon, type NetIconArt } from "@/components/net/collection/collection-art";
import { NetCollectionGrid, type NetCollectionItem } from "@/components/net/collection/net-collection-grid";
import { NetPartnerAffection, NetPartnerFormation } from "@/components/net/collection/net-partner";
import { netSeed } from "@/components/net/collection/seed";
import { NetEmpty } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const PARTNERS: readonly { id: string; art: NetIconArt }[] = [
  { id: "ai", art: "smug" },
  { id: "php", art: "php" },
  { id: "brace", art: "brace" },
  { id: "washer", art: "washer" },
  { id: "cookie", art: "cookie" },
];
const QUOTE_COUNT = 5;
const STAGE_COUNT = 3;

export default async function NetPartnerPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("collection");
  const snapshot = snapshotData?.snapshot;

  // A level per credit when the play count is public, otherwise one made up from the name.
  const seed = netSeed(`${username}/${region}`);
  const level = snapshot?.totalPlayCount || (seed % 900) + 100;
  const affection = Math.min(999, Math.round(level / 7) + (snapshot?.stars ?? 0));
  const quote = t(`partner.affection.quotes.${(seed + (snapshot?.rating ?? 0)) % QUOTE_COUNT}`);
  const levelLabel = t("partner.level", { level });

  const items: NetCollectionItem[] = PARTNERS.map(({ id, art }) => {
    const owned = id === "ai";
    return {
      id,
      group: owned ? "owned" : "locked",
      tag: t(`partner.tags.${owned ? "default" : "premium"}`),
      name: t(`partner.items.${id}.name`),
      condition: t(`partner.items.${id}.condition`),
      art: <NetCollectionIcon art={art} locked={!owned} />,
      owned,
    };
  });

  return (
    <>
      {!snapshotData && <NetEmpty>{t("noSnapshot")}</NetEmpty>}
      <NetPartnerFormation
        heading={t("partner.formation.heading")}
        leader={t("partner.formation.leader")}
        level={levelLabel}
        stars={snapshot?.stars ?? 1}
        lockedLabel={t("partner.formation.locked")}
      />
      <NetCollectionGrid
        kind="partner"
        items={items}
        groups={[{ id: "owned", label: t("partner.groups.owned") }, { id: "locked", label: t("partner.groups.locked") }]}
        currentId="ai"
        currentExtra={(
          <NetPartnerAffection
            points={String(affection)}
            levelLabel={levelLabel}
            stageLabel={t("partner.affection.now")}
            stages={Array.from({ length: STAGE_COUNT }, (_, index) => t(`partner.affection.stages.${index}`))}
            quote={quote}
          />
        )}
        shopHref={netPagePath(base, "shop")}
      />
    </>
  );
}
