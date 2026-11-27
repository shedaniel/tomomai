"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { NetEmpty, NetSelect, NetTitle } from "../kit";
import { findNetEgg } from "../eggs/eggs";
import { NetLockArt } from "../net-art";
import { useNetTier } from "../premium/tier";
import { NetTitlePlate } from "./collection-art";
import styles from "./collection.module.css";

export type NetCollectionKind = "icon" | "frame" | "title" | "partner";

/** One collectible, with every string already translated. */
export type NetCollectionItem = {
  id: string;
  group: string;
  tag: string;
  name: string;
  condition: string;
  art: ReactNode;
  owned: boolean;
};

export type NetCollectionGroup = { id: string; label: string };

type Filter = "all" | "owned" | "locked" | `group:${string}`;
type Notice = { id: string; key: "premium" | "saved" | "favorite" } | { id: string; refusal: number };

const PERSISTENT_ID = "persistent";
const PERSISTENT_PRESSES = 10;
const LOCKED_SET_STYLE = {
  borderColor: "#888",
  background: "#dcdcdc",
  boxShadow: "0 3px 0 #888",
  WebkitTextStrokeColor: "#999",
} as const;

function matches(filter: Filter, item: NetCollectionItem): boolean {
  if (filter === "all") return true;
  if (filter === "owned") return item.owned;
  if (filter === "locked") return !item.owned;
  return item.group === filter.slice("group:".length);
}

type CardProps = {
  kind: NetCollectionKind;
  item: NetCollectionItem;
  stamp?: string;
  extra?: ReactNode;
  children?: ReactNode;
};

function CollectionCard({ kind, item, stamp, extra, children }: CardProps) {
  const t = useTranslations("net.collection.grid");
  const stampEl = stamp && <em className={styles.stamp}>{stamp}</em>;
  const text = (
    <>
      <div className={styles.cardName}>{item.name}</div>
      <div className={styles.cardCondition}>{item.condition}</div>
    </>
  );
  return (
    <div className={cn(styles.card, !item.owned && styles.cardLocked, stamp && styles.cardCurrent)} data-kind={kind}>
      <span className={styles.cardTag}>{item.owned ? item.tag : t("locked")}</span>
      {kind === "title" ? (
        <>
          <div className={styles.cardPlate}>{stampEl}{item.art}</div>
          <div className={styles.cardCondition}>{item.condition}</div>
        </>
      ) : kind === "frame" ? (
        <>
          {text}
          <div className={styles.cardFrame}>{stampEl}{item.art}</div>
        </>
      ) : (
        <div className={styles.cardRow}>
          <div className={styles.cardArt}>
            {stampEl}
            {item.art}
            {!item.owned && <span className={styles.lockBadge}><NetLockArt size={18} /></span>}
          </div>
          <div className={styles.cardBody}>{text}{extra}</div>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * The SETTING box, count chips and filtered list shared by the icon, frame, title and partner pages.
 * Setting an owned item works only on the fake Premium course, and only until the page reloads.
 */
export function NetCollectionGrid({ kind, items, groups, currentId, currentExtra, shopHref }: {
  kind: NetCollectionKind;
  items: readonly NetCollectionItem[];
  groups: readonly NetCollectionGroup[];
  currentId: string;
  currentExtra?: ReactNode;
  shopHref: string;
}) {
  const t = useTranslations("net.collection");
  const premium = useNetTier() === "premium";
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(currentId);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lockedPresses, setLockedPresses] = useState(0);
  const persistent: NetCollectionItem | null = kind === "title" && lockedPresses >= PERSISTENT_PRESSES ? {
    id: PERSISTENT_ID,
    group: "rainbow",
    tag: t("grid.persistent.tag"),
    name: t("grid.persistent.name"),
    condition: t("grid.persistent.condition"),
    art: <NetTitlePlate rarity="rainbow">{t("grid.persistent.name")}</NetTitlePlate>,
    owned: true,
  } : null;
  const current = (selected === PERSISTENT_ID ? persistent : null) ?? items.find(item => item.id === selected) ?? items[0];
  const visible = groups
    .map(group => ({ group, items: items.filter(item => item.group === group.id && matches(filter, item)) }))
    .filter(entry => entry.items.length > 0);

  const pressLocked = (item: NetCollectionItem) => {
    const presses = lockedPresses + 1;
    setLockedPresses(presses);
    if (presses === PERSISTENT_PRESSES) {
      setSelected(PERSISTENT_ID);
      setNotice(null);
      findNetEgg("titlePersistent");
      return;
    }
    setNotice({ id: item.id, refusal: Math.min(presses, PERSISTENT_PRESSES - 1) });
  };

  const set = (item: NetCollectionItem) => {
    if (!item.owned) {
      pressLocked(item);
      return;
    }
    if (!premium) {
      setNotice({ id: item.id, key: "premium" });
      return;
    }
    setSelected(item.id);
    setNotice({ id: item.id, key: "saved" });
  };

  return (
    <>
      {current && (
        <section className={cn(styles.box, styles.setting)}>
          <h5 className={styles.boxHeading}>{t(`${kind}.setting`)}</h5>
          <CollectionCard kind={kind} item={current} stamp={t("grid.usingCurrently")} extra={current.id === currentId ? currentExtra : undefined} />
          {current.id === PERSISTENT_ID && <p className={styles.notice} role="status">{t("grid.persistent.granted")}</p>}
        </section>
      )}
      <div className={styles.chips}>
        <span>{t("grid.favorite")}</span>
        <span>{t(`${kind}.count`, { count: items.filter(item => item.owned).length })}</span>
      </div>
      <NetTitle>{t(`${kind}.title`)}</NetTitle>
      <NetSelect value={filter} onChange={event => setFilter(event.target.value as Filter)} aria-label={t("grid.filter.label")}>
        <option value="all">{t("grid.filter.all")}</option>
        <option value="owned">{t("grid.filter.owned")}</option>
        <option value="locked">{t("grid.filter.locked")}</option>
        {groups.map(group => <option key={group.id} value={`group:${group.id}`}>{group.label}</option>)}
      </NetSelect>
      {visible.length === 0 ? (
        <NetEmpty>{t("grid.empty")}</NetEmpty>
      ) : visible.map(({ group, items: groupItems }) => (
        <section key={group.id} className={styles.box}>
          <h5 className={styles.boxHeading}>
            {group.label}
            <small>{t("grid.own", { count: groupItems.filter(item => item.owned).length })}</small>
          </h5>
          <div className={cn(styles.grid, kind === "icon" && styles.gridIcons)}>
            {groupItems.map(item => (
              <CollectionCard key={item.id} kind={kind} item={item}>
                <div className={styles.actions}>
                  {item.owned && (
                    <button type="button" className={styles.favorite} onClick={() => setNotice({ id: item.id, key: "favorite" })}>
                      {t("grid.favoriteButton")}
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.set}
                    disabled={item.owned ? item.id === selected : kind !== "title" || lockedPresses >= PERSISTENT_PRESSES}
                    data-locked={!item.owned || undefined}
                    style={!item.owned ? LOCKED_SET_STYLE : undefined}
                    onClick={() => set(item)}
                  >
                    {item.id === selected ? t("grid.inUse") : t("grid.set")}
                  </button>
                </div>
                {notice?.id === item.id && (
                  <p className={styles.notice} role="status">
                    {"refusal" in notice ? t(`grid.persistent.refusals.${notice.refusal}`) : (
                      <>
                        {t(`grid.notice.${notice.key}`, { thing: t(`${kind}.thing`) })}
                        {notice.key === "premium" && <> <Link href={shopHref}>{t("grid.notice.shop")}</Link></>}
                      </>
                    )}
                  </p>
                )}
              </CollectionCard>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
