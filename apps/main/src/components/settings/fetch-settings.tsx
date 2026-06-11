"use client";

import { FetchToastContainer } from "@/components/fetch-toast";
import { TokenDialog } from "@/components/token-dialog";
import { Button } from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
import {
  SettingsField,
  SettingsFooter,
  SettingsForm,
  SettingsHeader,
  useDirtyFlag,
  useSettingsReset,
  useSettingsSave,
} from "@/components/settings/primitives";
import { useFetchSession } from "@/hooks/useFetchSession";
import { isCNExclusive } from "@tomomai/catalog/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { AlertCircle, Images, Key, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export function FetchSettings() {
  const t = useTranslations();
  return (
    <SettingsForm>
      <SettingsHeader
        title={t("settings.pages.fetch.title")}
        description={t("settings.pages.fetch.description")}
      />
      <FetchFields />
      <SettingsFooter />
    </SettingsForm>
  );
}

function FetchFields() {
  const t = useTranslations();
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false);
  const [selectedFetchUseAlbums, setSelectedFetchUseAlbums] = useState<boolean | null | undefined>(undefined);

  const { data: userData } = trpc.user.getUserData.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const { data: profileSettings, isLoading: profileSettingsLoading } = trpc.user.getProfileSettings.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const selectedRegion: Region = (userData?.region as Region) || "intl";

  const effectiveFetchUseAlbums = selectedFetchUseAlbums !== undefined
    ? selectedFetchUseAlbums
    : profileSettings?.fetchUseAlbums ?? null;

  const { startDataFetch, fetchToastState } = useFetchSession();
  const updateAlbumPreference = trpc.user.setAlbumPreference.useMutation();
  const deleteTokenMutation = trpc.user.deleteToken.useMutation();

  const albumsDirty = !!profileSettings && effectiveFetchUseAlbums !== null && effectiveFetchUseAlbums !== profileSettings.fetchUseAlbums;

  useDirtyFlag("fetch.albums", albumsDirty);

  useSettingsSave("fetch.albums", async () => {
    if (!profileSettings || !albumsDirty || effectiveFetchUseAlbums === null) return;
    await updateAlbumPreference.mutateAsync({ fetchUseAlbums: effectiveFetchUseAlbums });
  });

  useSettingsReset("fetch.albums", () => {
    setSelectedFetchUseAlbums(undefined);
  });

  const handleTokenUpdate = async (token: string) => {
    await startDataFetch(selectedRegion, token);
  };

  const handleDeleteToken = async () => {
    try {
      await deleteTokenMutation.mutateAsync({ region: selectedRegion });
      toast.success(t("settings.account.deleteTokenSuccess"));
    } catch (error) {
      console.error("Failed to delete token:", error);
      toast.error(t("settings.account.deleteTokenError"));
    }
  };

  return (
    <>
      <div className="grid gap-6">
        <SettingsField
          icon={Key}
          label={t("settings.account.label")}
          description={t("settings.account.description")}
        >
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setTokenDialogOpen(true)}
              className="justify-start bg-background w-fit"
            >
              <Key className="h-4 w-4 mr-2" />
              {t("settings.account.updateToken")}
            </Button>
            <ResponsiveDialog>
              <ResponsiveDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="justify-start bg-background w-fit"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("settings.account.deleteToken")}
                </Button>
              </ResponsiveDialogTrigger>
              <ResponsiveDialogContent showCloseButton={false}>
                <ResponsiveDialogHeader>
                  <ResponsiveDialogTitle>{t("settings.account.deleteTokenDialogTitle")}</ResponsiveDialogTitle>
                  <ResponsiveDialogDescription>
                    {t("settings.account.deleteTokenDialogDescription")}
                  </ResponsiveDialogDescription>
                </ResponsiveDialogHeader>
                <ResponsiveDialogFooter>
                  <ResponsiveDialogClose asChild>
                    <Button variant="outline">{t("common.cancel")}</Button>
                  </ResponsiveDialogClose>
                  <ResponsiveDialogClose asChild>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteToken}
                    >
                      {t("settings.account.deleteToken")}
                    </Button>
                  </ResponsiveDialogClose>
                </ResponsiveDialogFooter>
              </ResponsiveDialogContent>
            </ResponsiveDialog>
          </div>
        </SettingsField>

        {!isCNExclusive() && (
          <SettingsField
            layout="inline"
            icon={Images}
            label={t("settings.albumPrivacy.fetchAlbums")}
            description={t("settings.albumPrivacy.fetchAlbumsDescription")}
            htmlFor="fetch-albums"
            action={
              <Switch
                id="fetch-albums"
                checked={effectiveFetchUseAlbums ?? false}
                onCheckedChange={(v) => setSelectedFetchUseAlbums(v)}
                disabled={profileSettingsLoading || effectiveFetchUseAlbums === null}
              />
            }
          >
            {effectiveFetchUseAlbums === null && (
              <div className="flex gap-2 p-2 bg-muted border border-border rounded-sm">
                <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">{t("settings.albumPrivacy.notSet")}</p>
              </div>
            )}
          </SettingsField>
        )}
      </div>

      <TokenDialog
        region={selectedRegion}
        isOpen={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
        onTokenUpdate={handleTokenUpdate}
      />

      <FetchToastContainer state={fetchToastState} />
    </>
  );
}
