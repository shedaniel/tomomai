"use client";

import { useTranslations } from "next-intl";
import { ApiKeysSection } from "@/components/developer/api-keys-section";
import { OAuthAppsSection } from "@/components/developer/oauth-apps-section";
import { ScopeRoutesProvider, type ScopeRoutes } from "@/components/developer/developer-shared";
import { SettingsHeader, SettingsSection } from "@/components/settings/primitives";

export function DeveloperPortal({ scopeRoutes }: { scopeRoutes: ScopeRoutes }) {
  const t = useTranslations();

  return (
    <ScopeRoutesProvider value={scopeRoutes}>
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
    </ScopeRoutesProvider>
  );
}
