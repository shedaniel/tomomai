"use client";

import { useTranslations } from "next-intl";
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
      <ApiKeysSection />
      <SettingsSection>
        <OAuthAppsSection />
      </SettingsSection>
    </div>
  );
}
