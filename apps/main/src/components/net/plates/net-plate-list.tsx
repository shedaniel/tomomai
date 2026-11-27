"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NetEmpty, NetSelect } from "../kit";
import { NetPlateCard, type NetPlateData } from "./net-plate-card";
import styles from "./plates.module.css";

export type NetPlateGroup = { id: string; label: string };

type Filter = "all" | "earned" | "locked" | `group:${string}`;

function matches(filter: Filter, plate: NetPlateData): boolean {
  if (filter === "all") return true;
  if (filter === "earned") return plate.earned;
  if (filter === "locked") return !plate.earned;
  return plate.group === filter.slice("group:".length);
}

export function NetPlateList({ groups, plates }: { groups: readonly NetPlateGroup[]; plates: readonly NetPlateData[] }) {
  const t = useTranslations("net.plates");
  const [filter, setFilter] = useState<Filter>("all");
  const visible = groups
    .map(group => ({ group, plates: plates.filter(plate => plate.group === group.id && matches(filter, plate)) }))
    .filter(entry => entry.plates.length > 0);

  return (
    <>
      <NetSelect value={filter} onChange={event => setFilter(event.target.value as Filter)} aria-label={t("filter.label")}>
        <option value="all">{t("filter.all")}</option>
        <option value="earned">{t("filter.earned")}</option>
        <option value="locked">{t("filter.locked")}</option>
        {groups.map(group => <option key={group.id} value={`group:${group.id}`}>{group.label}</option>)}
      </NetSelect>
      {visible.length === 0 ? (
        <NetEmpty>{t("empty")}</NetEmpty>
      ) : visible.map(({ group, plates: groupPlates }) => (
        <section key={group.id} className={styles.box}>
          <h5 className={styles.boxHeading}>{group.label}</h5>
          {groupPlates.map(plate => <NetPlateCard key={plate.id} plate={plate} lockedLabel={t("locked")} />)}
        </section>
      ))}
    </>
  );
}
