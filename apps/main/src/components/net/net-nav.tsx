"use client";

import { Lock } from "lucide-react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { NET_PAGE_IDS, NET_PAGES, NET_SECTION_IDS, NET_SUB_TABS, NET_TILES, netPageFromPathname, netPagePath, type NetSectionId } from "@/lib/net/routes";
import { cn } from "@/lib/utils";
import { findNetEgg } from "./eggs/eggs";
import { NET_TILE_BACKGROUNDS, NetTileIcon } from "./net-icons";
import { useNetTier } from "./premium/tier";
import styles from "./nav.module.css";

const SUB_LOOK: Readonly<Record<NetSectionId, { background: string; ink: string }>> = {
  home: { background: "#ff7f73", ink: "#a8443b" },
  playData: { background: "#ffb23a", ink: "#a8661b" },
  friends: { background: "#ff4fa8", ink: "#8a1f5a" },
  shop: { background: "#5fe0be", ink: "#1f7a63" },
  records: { background: "#9be03a", ink: "#4f7d1b" },
  event: { background: "linear-gradient(90deg,#ff6f62,#ffb23a,#9be03a,#3fbcff)", ink: "#555" },
  collection: { background: "#3fbcff", ink: "#1d6fb0" },
  ranking: { background: "#b56cf7", ink: "#5a1f8a" },
};

const VISITED_KEY = "tomomai-net-visited";
const TOUR_PAGES = NET_PAGE_IDS.filter(id => id !== "secrets");

function readVisited(): string[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(VISITED_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function recordVisit(page: string, section: string) {
  const visited = readVisited();
  const next = [...visited, ...[`page:${page}`, `section:${section}`].filter(key => !visited.includes(key))];
  if (next.length !== visited.length) {
    try {
      window.localStorage.setItem(VISITED_KEY, JSON.stringify(next));
    } catch {
      // Without storage the tour only counts within this page load.
    }
  }
  if (NET_SECTION_IDS.every(id => next.includes(`section:${id}`))) findNetEgg("grandTour");
  if (TOUR_PAGES.every(id => next.includes(`page:${id}`))) findNetEgg("everyTab");
}

export function NetNav({ base }: { base: string }) {
  const t = useTranslations("net.common");
  const pathname = usePathname();
  const page = netPageFromPathname(pathname, base);
  const known = NET_PAGES[page].segment === (pathname.slice(pathname.indexOf(base) + base.length).replace(/^\/+|\/+$/g, "").split("/")[0] ?? "");
  useEffect(() => {
    if (known) recordVisit(page, NET_PAGES[page].section);
  }, [known, page]);
  const subscribed = useNetTier() !== "free";
  const section = NET_PAGES[page].section;
  const subTabs = NET_SUB_TABS[section];
  const sub = SUB_LOOK[section];

  return (
    <nav>
      <div className={styles.wrap}>
        <div className={styles.tiles}>
          {NET_TILES.map(tile => {
            const background = NET_TILE_BACKGROUNDS[tile.id];
            return (
              <Link
                key={tile.id}
                href={netPagePath(base, tile.page)}
                className={cn(styles.tile, tile.id === section && styles.active)}
                style={{ background }}
                aria-current={tile.id === section ? "page" : undefined}
              >
                <NetTileIcon section={tile.id} className={styles.icon} />
                <span className={styles.label}>{t(`tiles.${tile.id}`)}</span>
                {tile.locked && !subscribed && <b className={styles.lock}><Lock size={8} strokeWidth={3} aria-hidden />{t("lockBadge")}</b>}
              </Link>
            );
          })}
        </div>
      </div>
      {subTabs.length > 0 && (
        <div className={styles.sub} style={{ background: sub.background, ["--net-sub-ink" as string]: sub.ink }}>
          {subTabs.map(tab => (
            <Link
              key={tab.labelKey}
              href={netPagePath(base, tab.page)}
              className={cn(styles.subTab, tab.page === page && styles.subActive)}
            >
              {t(`subTabs.${tab.labelKey}`)}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
