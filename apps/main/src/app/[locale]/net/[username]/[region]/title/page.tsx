import { NetTitlePlate, type NetTitleRarity } from "@/components/net/collection/collection-art";
import { NetCollectionGrid, type NetCollectionItem } from "@/components/net/collection/net-collection-grid";
import { NetEmpty } from "@/components/net/kit";
import { NET_TITLE_TYPES } from "@/components/net/title-types";
import { setStaticLocale } from "@/i18n/locale-server";
import { getNetTranslations } from "@/lib/net/messages";
import { loadNetPlayer, type NetPageParams } from "@/lib/net/player";
import { netPagePath } from "@/lib/net/routes";

export const dynamic = "force-dynamic";

type JokeTitle = { id: string; rarity: NetTitleRarity; owned: (stats: { plays: number; rating: number }) => boolean };

const always = () => true;
const never = () => false;

const JOKE_TITLES: readonly JokeTitle[] = [
  { id: "loggedIn", rarity: "normal", owned: always },
  { id: "oneMore", rarity: "normal", owned: ({ plays }) => plays >= 1 },
  { id: "queue", rarity: "normal", owned: never },
  { id: "glove", rarity: "normal", owned: never },
  { id: "regular", rarity: "bronze", owned: ({ plays }) => plays >= 1000 },
  { id: "slide", rarity: "bronze", owned: never },
  { id: "maintenance", rarity: "bronze", owned: never },
  { id: "rating", rarity: "silver", owned: ({ rating }) => rating >= 10000 },
  { id: "staff", rarity: "silver", owned: ({ plays }) => plays >= 5000 },
  { id: "wrist", rarity: "silver", owned: never },
  { id: "php", rarity: "gold", owned: never },
  { id: "aiFriend", rarity: "gold", owned: never },
  { id: "rainbow", rarity: "gold", owned: ({ rating }) => rating >= 15000 },
  { id: "apDreams", rarity: "rainbow", owned: never },
  { id: "premium", rarity: "rainbow", owned: never },
  { id: "april", rarity: "rainbow", owned: never },
];

export default async function NetTitlePage({ params }: NetPageParams) {
  const { locale, username, region } = await params;
  await setStaticLocale(locale);
  const { snapshotData, base } = await loadNetPlayer(username, region);
  const t = await getNetTranslations("collection");
  const snapshot = snapshotData?.snapshot;
  const stats = { plays: snapshot?.totalPlayCount ?? 0, rating: snapshot?.rating ?? 0 };

  const items: NetCollectionItem[] = JOKE_TITLES.map(title => {
    const owned = title.owned(stats);
    const name = t(`title.items.${title.id}.name`);
    return {
      id: title.id,
      group: title.rarity,
      tag: t(`title.rarity.${title.rarity}`),
      name,
      condition: t(`title.items.${title.id}.condition`),
      art: <NetTitlePlate rarity={title.rarity} locked={!owned}>{name}</NetTitlePlate>,
      owned,
    };
  });

  if (snapshot) {
    const rarity = NET_TITLE_TYPES[snapshot.titleType] ?? "normal";
    const name = snapshot.title.trim() || t("title.current.noTitle");
    items.unshift({
      id: "cabinet",
      group: rarity,
      tag: t(`title.rarity.${rarity}`),
      name,
      condition: t("title.current.condition"),
      art: <NetTitlePlate rarity={rarity}>{name}</NetTitlePlate>,
      owned: true,
    });
  }

  return (
    <>
      {!snapshotData && <NetEmpty>{t("noSnapshot")}</NetEmpty>}
      <NetCollectionGrid
        kind="title"
        items={items}
        groups={NET_TITLE_TYPES.map(rarity => ({ id: rarity, label: t(`title.rarity.${rarity}`) }))}
        currentId={items[0].id}
        shopHref={netPagePath(base, "shop")}
      />
    </>
  );
}
