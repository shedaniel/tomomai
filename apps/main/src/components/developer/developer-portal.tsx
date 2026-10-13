"use client";

import { useTranslations } from "next-intl";
import { BookOpen, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ApiKeysSection } from "@/components/developer/api-keys-section";
import { OAuthAppsSection } from "@/components/developer/oauth-apps-section";
import { SettingsHeader, SettingsSection } from "@/components/settings/primitives";

export function DeveloperPortal() {
  const t = useTranslations();

  return (
    <div>
      <SettingsHeader
        title={t("settings.pages.developer.title")}
        description={t("settings.pages.developer.description")}
      />
      <Link
        href="/developer"
        className="group mb-8 flex items-center gap-3 rounded-md border border-border bg-muted/30 px-4 py-3 transition-colors hover:bg-muted/60"
      >
        <BookOpen className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t("settings.pages.developer.portalTitle")}</div>
          <div className="text-sm text-muted-foreground">{t("settings.pages.developer.portalDescription")}</div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
      <ApiKeysSection />
      <SettingsSection>
        <OAuthAppsSection />
      </SettingsSection>
    </div>
  );
}
