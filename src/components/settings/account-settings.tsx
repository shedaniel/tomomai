"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { ChangeUsernameDialog } from "@/components/settings/change-username-dialog";
import { SessionsSection } from "@/components/settings/sessions-section";
import { LinkedAccountsSection } from "@/components/settings/linked-accounts-section";
import { PasskeysSection } from "@/components/settings/passkeys-section";
import { Button } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui/select-friendly";
import { Locale, setLocaleCookie } from "@/i18n/locale";
import { isCNExclusive } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { getLanguages } from "@/lib/utils";
import { Languages, Pencil, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export function AccountSettings() {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(locale || null);
  const [isLoading, setIsLoading] = useState(false);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);

  const { data: userData, refetch: refetchUserData } = trpc.user.getUserData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const LANGUAGES = getLanguages(t);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (selectedLanguage !== locale) {
        if (selectedLanguage) {
          setLocaleCookie(selectedLanguage as Locale);
          setLocale(selectedLanguage as Locale);
        } else {
          if (typeof document !== "undefined") {
            document.cookie = "NEXT_LOCALE=; path=/; max-age=0";
          }
          window.location.reload();
        }
      }
      toast.success(t("settings.saved"));
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error(t("settings.errorSaving"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedLanguage(locale || null);
  };

  if (isCNExclusive()) {
    return (
      <div className="">
        <p className="text-sm text-muted-foreground">暂无账户设置。</p>
      </div>
    );
  }

  return (
    <div className="">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t("settings.pages.account.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.pages.account.description")}</p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label className="flex items-center gap-2">
            <User className="h-4 w-4" />
            {t("usernameSetup.usernameLabel")}
          </Label>
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
        </div>

        <div className="grid gap-2">
          <Label htmlFor="language" className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            {t("settings.language.label")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("settings.language.description")}</p>
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
        </div>
      </div>

      <div className="mt-6 border-t pt-6">
        <LinkedAccountsSection />
      </div>

      <div className="mt-6 border-t pt-6">
        <PasskeysSection />
      </div>

      <div className="mt-6 border-t pt-6">
        <SessionsSection />
      </div>

      <div className="flex justify-end space-x-2 mt-10 border-t pt-6">
        <Button variant="outline" onClick={handleReset} disabled={isLoading}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? t("settings.saving") : t("settings.saveChanges")}
        </Button>
      </div>

      <ChangeUsernameDialog
        open={usernameDialogOpen}
        onOpenChange={setUsernameDialogOpen}
        currentUsername={userData?.username ?? undefined}
        onSuccess={refetchUserData}
      />
    </div>
  );
}
