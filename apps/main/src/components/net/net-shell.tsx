import type { ReactNode } from "react";
import NextLink from "next/link";
import { Link } from "@/i18n/navigation";
import { getNetTranslations } from "@/lib/net/messages";
import { netPagePath } from "@/lib/net/routes";
import { NetGearArt } from "./net-art";
import { NetJumpButtons } from "./net-jump-buttons";
import { NetNav } from "./net-nav";
import { NetPhpWarning } from "./net-php-warning";
import { NetGlobalEggs } from "./eggs/global-eggs";
import { NetEggCopyright, NetEggTown } from "./eggs/global-footer";
import { NetEggGear, NetEggLogo } from "./eggs/global-header";
import { NetEggPrint } from "./eggs/global-print";
import { NetEggToast } from "./eggs/net-egg-toast";
import { NetSecretsDialog } from "./secrets/net-secrets-dialog";
import { NetCelebration } from "./premium/net-celebration";
import { NetDarkModeEffect, NetTierBadge } from "./premium/net-premium-chrome";
import styles from "./shell.module.css";

/** The DX NET frame every /net page shares: logo, menu tiles, section tabs and the green footer. */
export async function NetShell({ base, profilePath, children }: { base: string; profilePath: string; children: ReactNode }) {
  const t = await getNetTranslations("common");
  return (
    <div className={styles.stage} data-net-stage>
      <div className={`${styles.edge} ${styles.edgeLeft}`}>{t("edges.left")}</div>
      <div className={`${styles.edge} ${styles.edgeRight}`}>{t("edges.right")}</div>
      <div className={styles.column}>
        <NetPhpWarning base={base} />
        <header className={styles.head}>
          <NetEggLogo href={base} className={styles.logo} label={t("brand.label")}>
            <span className={styles.arc} />
            <span className={styles.cloud} />
            <div className={styles.latin}>tomo<b>mai</b></div>
            <div className={styles.kana}>{t("brand.kana")}<small>DX</small></div>
            <span className={styles.netBadge}>NET</span>
          </NetEggLogo>
          <NetEggGear href={netPagePath(base, "options")} className={styles.gear} label={t("options")}><NetGearArt size={30} /></NetEggGear>
          <NetTierBadge />
        </header>
        <NetNav base={base} />
        <main className={styles.main}>{children}</main>
        <div className={styles.town}><NetEggTown /></div>
        <footer className={styles.foot}>
          <Link href={profilePath} className={styles.exit}>{t("footer.exit")}</Link>
          <NextLink href="/tos" prefetch={false} className={styles.footLink}>{t("footer.terms")}</NextLink>
          <NextLink href="/privacy" prefetch={false} className={styles.footLink}>{t("footer.privacy")}</NextLink>
          <div className={styles.footRule} />
          <div className={styles.mark}>tomomai</div>
          <div className={styles.copy}>{t("footer.copyright")}</div>
          <NetEggCopyright className={styles.more} />
        </footer>
      </div>
      <NetJumpButtons />
      <NetCelebration />
      <NetGlobalEggs />
      <NetEggPrint />
      <NetSecretsDialog />
      <NetEggToast />
      <NetDarkModeEffect />
    </div>
  );
}
