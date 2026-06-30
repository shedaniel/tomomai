"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { stripLocaleFromPath } from "@tomomai/i18n/client";
import { ChangeUsernameDialog } from "@/components/settings/change-username-dialog";
import { SessionsSection } from "@/components/settings/sessions-section";
import { LinkedAccountsSection, type LinkedAccountProviderId } from "@/components/settings/linked-accounts-section";
import { PasskeysSection } from "@/components/settings/passkeys-section";
import {
  SettingsField,
  SettingsFooter,
  SettingsForm,
  SettingsHeader,
  SettingsSection,
  useDirtyFlag,
  useSettingsReset,
  useSettingsSave,
} from "@/components/settings/primitives";
import { Button } from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { Locale, setLocaleCookie } from "@/i18n/locale";
import { usePathname } from "@/i18n/navigation";
import { isCNExclusive } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { getLanguages } from "@/lib/utils";
import { Languages, Mail, Pencil, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

interface AccountSettingsProps {
  flags: { passkey: boolean; twitterOauth: boolean };
}

export function AccountSettings({ flags }: AccountSettingsProps) {
  const t = useTranslations();

  if (isCNExclusive()) {
    return (
      <div>
        <p className="text-sm text-muted-foreground">暂无账户设置。</p>
      </div>
    );
  }

  const enabledProviders: LinkedAccountProviderId[] = ["discord"];
  if (flags.twitterOauth) enabledProviders.push("twitter");

  return (
    <SettingsForm>
      <SettingsHeader
        title={t("settings.pages.account.title")}
        description={t("settings.pages.account.description")}
      />
      <AccountFields />
      <SettingsSection>
        <LinkedAccountsSection enabledProviders={enabledProviders} />
      </SettingsSection>
      {flags.passkey && (
        <SettingsSection>
          <PasskeysSection />
        </SettingsSection>
      )}
      <SettingsSection>
        <SessionsSection />
      </SettingsSection>
      <SettingsFooter />
    </SettingsForm>
  );
}

function AccountFields() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const pathname = usePathname();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(locale || null);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);

  const { data: userData, refetch: refetchUserData } = trpc.user.getUserData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const LANGUAGES = getLanguages(t);

  useDirtyFlag("account.language", selectedLanguage !== (locale || null));

  useSettingsSave("account.language", async () => {
    if (selectedLanguage === (locale || null)) return;
    if (selectedLanguage) {
      setLocaleCookie(selectedLanguage as Locale);
      setLocale(selectedLanguage as Locale);
    } else {
      if (typeof document !== "undefined") {
        document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
        const search = window.location.search;
        const hash = window.location.hash;
        window.location.href = `${stripLocaleFromPath(pathname || "/")}${search}${hash}`;
      }
    }
  });

  useSettingsReset("account.language", () => {
    setSelectedLanguage(locale || null);
  });

  return (
    <div className="grid gap-6">
      <SettingsField
        icon={User}
        label={t("usernameSetup.usernameLabel")}
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm bg-muted px-3 py-2 rounded-md flex-1 min-w-0 truncate text-foreground">
            {userData?.username ?? "—"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setUsernameDialogOpen(true)}
            className="shrink-0"
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t("usernameSetup.changeButton")}
          </Button>
        </div>
      </SettingsField>

      <SettingsField
        icon={Mail}
        label={t("common.email")}
      >
        <span className="font-mono text-sm bg-muted px-3 py-2 rounded-md flex-1 min-w-0 truncate text-foreground">
          {userData?.email ?? "—"}
        </span>
      </SettingsField>

      <SettingsField
        icon={Languages}
        label={t("settings.language.label")}
        description={t("settings.language.description")}
        htmlFor="language"
      >
        <Select
          value={selectedLanguage || "auto"}
          onValueChange={(value) => setSelectedLanguage(value === "auto" ? null : value)}
        >
          <SelectTrigger id="language" className="bg-background">
            <SelectValue placeholder={t("settings.language.label")} />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((language) => (
              <SelectItem key={language.value || "auto"} value={language.value || "auto"}>
                <div className="flex items-center space-x-2">
                  <Languages className="h-4 w-4" />
                  <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">{language.code}</span>
                  <span>{language.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>

      <ChangeUsernameDialog
        open={usernameDialogOpen}
        onOpenChange={setUsernameDialogOpen}
        currentUsername={userData?.username ?? undefined}
        onSuccess={refetchUserData}
      />
    </div>
  );
}
