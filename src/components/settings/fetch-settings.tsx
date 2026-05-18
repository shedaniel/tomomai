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
import { Label } from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
import { useFetchSession } from "@/hooks/useFetchSession";
import { isCNExclusive } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import { Region } from "@/lib/types";
import { AlertCircle, Images, Key, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

export function FetchSettings() {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSave = async () => {
    setIsLoading(true);
    try {
      if (profileSettings && effectiveFetchUseAlbums !== null && effectiveFetchUseAlbums !== profileSettings.fetchUseAlbums) {
        await updateAlbumPreference.mutateAsync({ fetchUseAlbums: effectiveFetchUseAlbums });
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
    setSelectedFetchUseAlbums(undefined);
  };

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

  const isLoadingSettings = profileSettingsLoading || isLoading;

  return (
    <div className="">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">{t("settings.pages.fetch.title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("settings.pages.fetch.description")}</p>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            {t("settings.account.label")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("settings.account.description")}</p>
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
        </div>

        {!isCNExclusive() && <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <div className="grid gap-2">
              <Label htmlFor="fetch-albums" className="flex items-center gap-2">
                <Images className="h-4 w-4" />
                {t("settings.albumPrivacy.fetchAlbums")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("settings.albumPrivacy.fetchAlbumsDescription")}</p>
            </div>
            <Switch
              id="fetch-albums"
              checked={effectiveFetchUseAlbums ?? false}
              onCheckedChange={(v) => setSelectedFetchUseAlbums(v)}
              disabled={isLoadingSettings || effectiveFetchUseAlbums === null}
            />
          </div>
          {effectiveFetchUseAlbums === null && (
            <div className="flex gap-2 p-2 bg-muted border border-border rounded-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">{t("settings.albumPrivacy.notSet")}</p>
            </div>
          )}
        </div>}
      </div>

      <div className="flex justify-end space-x-2 mt-10 border-t pt-6">
        <Button variant="outline" onClick={handleReset} disabled={isLoadingSettings}>
          {t("common.cancel")}
        </Button>
        <Button onClick={handleSave} disabled={isLoadingSettings}>
          {isLoadingSettings ? t("settings.saving") : t("settings.saveChanges")}
        </Button>
      </div>

      <TokenDialog
        region={selectedRegion}
        isOpen={tokenDialogOpen}
        onOpenChange={setTokenDialogOpen}
        onTokenUpdate={handleTokenUpdate}
      />

      <FetchToastContainer state={fetchToastState} />
    </div>
  );
}
