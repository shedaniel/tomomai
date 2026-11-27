import { NET_ICON_ART, NetCollectionIcon, type NetIconArt } from "@/components/net/collection/collection-art";
import styles from "@/components/net/collection/collection.module.css";
import { NetCollectionGrid, type NetCollectionItem } from "@/components/net/collection/net-collection-grid";
import { NetEmpty } from "@/components/net/kit";
import { NetImage } from "@/components/net/net-image";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const EVENT_ICONS: ReadonlySet<NetIconArt> = new Set(["error", "cookie", "tap"]);

export default async function NetIconPage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("collection");

  const items: NetCollectionItem[] = NET_ICON_ART.map(art => {
    const owned = art === "default";
    return {
      id: art,
      group: owned ? "current" : "joke",
      tag: t(`icon.tags.${owned ? "default" : EVENT_ICONS.has(art) ? "event" : "premium"}`),
      name: t(`icon.items.${art}.name`),
      condition: t(`icon.items.${art}.condition`),
      art: <NetCollectionIcon art={art} locked={!owned} />,
      owned,
    };
  });

  const iconUrl = snapshotData?.snapshot.iconUrl;
  if (iconUrl) {
    items.unshift({
      id: "cabinet",
      group: "current",
      tag: t("icon.tags.current"),
      name: t("icon.current.name"),
      condition: t("icon.current.condition"),
      art: <span className={`${styles.iconTile} ${styles.iconPhoto}`}><NetImage src={iconUrl} /></span>,
      owned: true,
    });
  }

  return (
    <>
      {!snapshotData && <NetEmpty>{t("noSnapshot")}</NetEmpty>}
      <NetCollectionGrid
        kind="icon"
        items={items}
        groups={[{ id: "current", label: t("icon.groups.current") }, { id: "joke", label: t("icon.groups.joke") }]}
        currentId={items[0].id}
        shopHref={netPagePath(base, "shop")}
      />
    </>
  );
}
