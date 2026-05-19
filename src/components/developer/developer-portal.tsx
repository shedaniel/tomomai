"use client";

import { useTranslations } from "next-intl";
import { ApiKeysSection } from "@/components/developer/api-keys-section";
import { OAuthAppsSection } from "@/components/developer/oauth-apps-section";

export function DeveloperPortal() {
  const t = useTranslations();

  return (
    <div className="">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t("settings.pages.developer.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.pages.developer.description")}</p>
      </div>

      <ApiKeysSection />
      <div className="mt-6 border-t pt-6">
        <OAuthAppsSection />
      </div>
    </div>
  );
}
