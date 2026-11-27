import { NET_FRAME_STYLES, NetCollectionFrame, type NetFrameStyle } from "@/components/net/collection/collection-art";
import { NetCollectionGrid, type NetCollectionItem } from "@/components/net/collection/net-collection-grid";
import { NetEmpty } from "@/components/net/kit";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

const EVENT_FRAMES: ReadonlySet<NetFrameStyle> = new Set(["maintenance", "bluescreen", "login"]);

export default async function NetFramePage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("collection");

  const items: NetCollectionItem[] = (Object.keys(NET_FRAME_STYLES) as NetFrameStyle[]).map(frame => {
    const owned = frame === "default";
    return {
      id: frame,
      group: owned ? "default" : "joke",
      tag: t(`frame.tags.${owned ? "default" : EVENT_FRAMES.has(frame) ? "event" : "premium"}`),
      name: t(`frame.items.${frame}.name`),
      condition: t(`frame.items.${frame}.condition`),
      art: <NetCollectionFrame frame={frame} motif={t(`frame.items.${frame}.motif`)} locked={!owned} />,
      owned,
    };
  });

  return (
    <>
      {!snapshotData && <NetEmpty>{t("noSnapshot")}</NetEmpty>}
      <NetCollectionGrid
        kind="frame"
        items={items}
        groups={[{ id: "default", label: t("frame.groups.default") }, { id: "joke", label: t("frame.groups.joke") }]}
        currentId="default"
        shopHref={netPagePath(base, "shop")}
      />
    </>
  );
}
