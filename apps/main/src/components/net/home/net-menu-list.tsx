import { Link } from "@/i18n/navigation";
import type { NetSectionId } from "@/lib/net/routes";
import { NET_TILE_BACKGROUNDS, NetTileIcon } from "../net-icons";
import styles from "./home.module.css";

export type NetMenuGroup = {
  label: string;
  section: NetSectionId;
  links: readonly { label: string; href: string; joke?: boolean }[];
};

/** The white sitemap box on the DX NET home page: an icon tile beside a column of underlined links. */
export function NetMenuList({ groups }: { groups: readonly NetMenuGroup[] }) {
  return (
    <nav className={styles.menu}>
      {groups.map(group => (
        <div key={group.label} className={styles.item}>
          <div className={styles.icon} style={{ background: NET_TILE_BACKGROUNDS[group.section] }}>
            <NetTileIcon section={group.section} />
            <span>{group.label}</span>
          </div>
          <ul className={styles.links}>
            {group.links.map(link => (
              <li key={link.label}>
                <Link href={link.href} className={link.joke ? styles.joke : undefined}>{link.label}</Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
