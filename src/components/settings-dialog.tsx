"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select-friendly";
import { Switch } from "@/components/ui/switch";
import { Locale, setLocaleCookie } from "@/i18n/locale";
import { TIMEZONE_ENUM, TIMEZONES } from "@/lib/db/types";
import { trpc } from "@/lib/trpc-client";
import { ProfilePrivacySettings, ProfileSettings } from "@/lib/types";
import { getLanguages } from "@/lib/utils";
import { Copy, ExternalLink, Globe, Key, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTimezone?: typeof TIMEZONE_ENUM[number] | null;
  username?: string;
  initialProfileSettings?: ProfileSettings;
  onTimezoneUpdate: (timezone: typeof TIMEZONE_ENUM[number] | null) => Promise<void>;
  onOpenTokenDialog: () => void;
  onSaveSuccess: () => void;
}

export function SettingsDialog({ 
  open, 
  onOpenChange, 
  currentTimezone, 
  username,
  initialProfileSettings,
  onTimezoneUpdate,
  onOpenTokenDialog,
  onSaveSuccess, 
}: SettingsDialogProps) {
  const t = useTranslations();
  const { locale, setLocale } = useLocale();
  const [selectedTimezone, setSelectedTimezone] = useState<typeof TIMEZONE_ENUM[number] | null>(currentTimezone ?? null);
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(locale || null);
  const [isLoading, setIsLoading] = useState(false);

  // Profile settings state
  const [selectedPublishProfile, setSelectedPublishProfile] = useState(initialProfileSettings?.publishProfile ?? false);
  const [selectedMainRegion, setSelectedMainRegion] = useState<'intl' | 'jp'>(initialProfileSettings?.profileMainRegion ?? 'intl');
  const [selectedPrivacySettings, setSelectedPrivacySettings] = useState<ProfilePrivacySettings>({
    profileShowAllScores: initialProfileSettings?.profileShowAllScores ?? true,
    profileShowScoreDetails: initialProfileSettings?.profileShowScoreDetails ?? true,
    profileShowPlates: initialProfileSettings?.profileShowPlates ?? true,
    profileShowPlayCounts: initialProfileSettings?.profileShowPlayCounts ?? true,
    profileShowEvents: initialProfileSettings?.profileShowEvents ?? true,
    profileShowInSearch: initialProfileSettings?.profileShowInSearch ?? true,
  });

  // tRPC hooks with initial data
  const { data: profileSettings, isLoading: profileSettingsLoading } = trpc.user.getProfileSettings.useQuery(undefined, {
    enabled: open,
    initialData: initialProfileSettings,
    refetchOnWindowFocus: false,
  });
  const updatePublishProfile = trpc.user.updatePublishProfile.useMutation();
  const updateProfileMainRegion = trpc.user.updateProfileMainRegion.useMutation();
  const updateProfilePrivacySettings = trpc.user.updateProfilePrivacySettings.useMutation();

  // Update local state when profile settings are loaded
  // useEffect(() => {
  //   if (profileSettings) {
  //     setSelectedPublishProfile(profileSettings.publishProfile);
  //     setSelectedMainRegion(profileSettings.profileMainRegion);
  //     setSelectedPrivacySettings({
  //       profileShowAllScores: profileSettings.profileShowAllScores,
  //       profileShowScoreDetails: profileSettings.profileShowScoreDetails,
  //       profileShowPlates: profileSettings.profileShowPlates,
  //       profileShowPlayCounts: profileSettings.profileShowPlayCounts,
  //       profileShowEvents: profileSettings.profileShowEvents,
  //       profileShowInSearch: profileSettings.profileShowInSearch,
  //     });
  //   }
  // }, [profileSettings]);

  const LANGUAGES = getLanguages(t);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const promises = [
        onTimezoneUpdate(selectedTimezone)
      ];

      // Update profile settings
      if (profileSettings) {
        if (selectedPublishProfile !== profileSettings.publishProfile) {
          promises.push(updatePublishProfile.mutateAsync({ publishProfile: selectedPublishProfile }).then(() => {}));
        }

        if (selectedMainRegion !== profileSettings.profileMainRegion) {
          promises.push(updateProfileMainRegion.mutateAsync({ profileMainRegion: selectedMainRegion }).then(() => {}));
        }

        // Check if privacy settings changed
        const privacyChanged = 
          selectedPrivacySettings.profileShowAllScores !== profileSettings.profileShowAllScores ||
          selectedPrivacySettings.profileShowScoreDetails !== profileSettings.profileShowScoreDetails ||
          selectedPrivacySettings.profileShowPlates !== profileSettings.profileShowPlates ||
          selectedPrivacySettings.profileShowPlayCounts !== profileSettings.profileShowPlayCounts ||
          selectedPrivacySettings.profileShowEvents !== profileSettings.profileShowEvents ||
          selectedPrivacySettings.profileShowInSearch !== profileSettings.profileShowInSearch;

        if (privacyChanged) {
          promises.push(updateProfilePrivacySettings.mutateAsync(selectedPrivacySettings).then(() => {}));
        }
      }

      await Promise.all(promises);
      
      // Update the locale immediately if language changed (using cookies only)
      if (selectedLanguage !== locale) {
        if (selectedLanguage) {
          setLocaleCookie(selectedLanguage as Locale);
          setLocale(selectedLanguage as Locale);
        } else {
          // Clear cookie to use auto-detection
          if (typeof document !== 'undefined') {
            document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
          }
          // Reload to detect language from browser
          window.location.reload();
        }
      }
      
      toast.success(t('settings.saved'));
      onSaveSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update settings:", error);
      toast.error(t('settings.errorSaving'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedTimezone(currentTimezone ?? null);
    setSelectedLanguage(locale || null);
    
    // Reset profile settings to original values
    if (profileSettings) {
      setSelectedPublishProfile(profileSettings.publishProfile);
      setSelectedMainRegion(profileSettings.profileMainRegion);
      setSelectedPrivacySettings({
        profileShowAllScores: profileSettings.profileShowAllScores,
        profileShowScoreDetails: profileSettings.profileShowScoreDetails,
        profileShowPlates: profileSettings.profileShowPlates,
        profileShowPlayCounts: profileSettings.profileShowPlayCounts,
        profileShowEvents: profileSettings.profileShowEvents,
        profileShowInSearch: profileSettings.profileShowInSearch,
      });
    }
    
    onOpenChange(false);
  };

  const getCurrentTimezoneDisplay = () => {
    return selectedTimezone || "jp"; // Use "jp" as the key for null timezone
  };

  const getProfileUrl = () => {
    if (!username) return '';
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}/profile/${username}`
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(getProfileUrl());
      toast.success(t('settings.profile.url.copied'));
    } catch (error) {
      console.error('Failed to copy URL:', error);
      toast.error(t('settings.profile.url.copyFailed'));
    }
  };

  const openProfile = () => {
    window.open(getProfileUrl(), '_blank');
  };

  const updatePrivacySetting = (key: keyof ProfilePrivacySettings, value: boolean) => {
    setSelectedPrivacySettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const isLoadingSettings = profileSettingsLoading || isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label htmlFor="language">{t('settings.language.label')}</Label>
            <Select 
              value={selectedLanguage || "auto"}
              onValueChange={(value) => {
                setSelectedLanguage(value === "auto" ? null : value);
              }}
            >
              <SelectTrigger id="language">
                <SelectValue placeholder={t('settings.language.label')} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem 
                    key={language.value || "auto"} 
                    value={language.value || "auto"}
                  >
                    <div className="flex items-center space-x-2">
                      <Languages className="h-4 w-4" />
                      <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                        {language.code}
                      </span>
                      <span>{language.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.language.description')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="timezone">{t('settings.timezone.label')}</Label>
            <Select 
              value={getCurrentTimezoneDisplay()}
              onValueChange={(value) => {
                setSelectedTimezone(value === "jp" ? null : value as typeof TIMEZONE_ENUM[number]);
              }}
            >
              <SelectTrigger id="timezone">
                <SelectValue placeholder={t('settings.timezone.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((timezone) => (
                  <SelectItem 
                    key={timezone.value || "jp"} 
                    value={timezone.value || "jp"}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                        {timezone.region}
                      </span>
                      <span>{timezone.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('settings.timezone.description')}
            </p>
          </div>

          <div className="grid gap-2">
            <Label>{t('settings.account.label')}</Label>
            <Button 
              variant="outline" 
              onClick={onOpenTokenDialog}
              className="justify-start"
            >
              <Key className="h-4 w-4 mr-2" />
              {t('settings.account.updateToken')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('settings.account.description')}
            </p>
          </div>

          {/* Profile Publishing Section */}
          <div className="grid gap-4 border-t pt-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="publish-profile" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t('settings.profile.publishProfile')}
                </Label>
                <Switch
                  id="publish-profile"
                  checked={selectedPublishProfile}
                  onCheckedChange={setSelectedPublishProfile}
                  disabled={isLoadingSettings}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('settings.profile.publishDescription')}
              </p>
            </div>

            {selectedPublishProfile && (
              <div className="grid gap-4 pl-4 border-l-2 border-muted">
                {/* Main Region Selection */}
                <div className="grid gap-2">
                  <Label htmlFor="main-region">{t('settings.profile.mainRegion.label')}</Label>
                  <Select 
                    value={selectedMainRegion}
                    onValueChange={(value: 'intl' | 'jp') => setSelectedMainRegion(value)}
                    disabled={isLoadingSettings}
                  >
                    <SelectTrigger id="main-region">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="intl">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">INTL</span>
                          <span>{t('settings.profile.mainRegion.intl')}</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="jp">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-mono bg-muted px-1 py-0.5 rounded">JP</span>
                          <span>{t('settings.profile.mainRegion.jp')}</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.profile.mainRegion.description')}
                  </p>
                </div>

                {/* Privacy Settings */}
                <div className="grid gap-3">
                  <Label>{t('settings.profile.privacy.label')}</Label>
                  
                  <div className="grid gap-3">
                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showAllScores.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showAllScores.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowAllScores}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowAllScores', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showScoreDetails.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showScoreDetails.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowScoreDetails}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowScoreDetails', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showPlates.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showPlates.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowPlates}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowPlates', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showPlayCounts.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showPlayCounts.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowPlayCounts}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowPlayCounts', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showEvents.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showEvents.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowEvents}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowEvents', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="grid gap-1">
                        <Label className="text-sm font-normal">{t('settings.profile.privacy.showInSearch.label')}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.profile.privacy.showInSearch.description')}
                        </p>
                      </div>
                      <Switch
                        checked={selectedPrivacySettings.profileShowInSearch}
                        onCheckedChange={(checked) => updatePrivacySetting('profileShowInSearch', checked)}
                        disabled={isLoadingSettings}
                      />
                    </div>
                  </div>
                </div>

                {/* Profile URL Section */}
                {username && (
                  <div className="grid gap-2">
                    <Label>{t('settings.profile.url.label')}</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 p-2 bg-gray-200/70 rounded-md text-sm font-mono text-muted-foreground break-all">
                        {getProfileUrl()}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={copyToClipboard}
                        className="shrink-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={openProfile}
                        className="shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.profile.url.description')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoadingSettings}>
            {isLoadingSettings ? t('settings.saving') : t('settings.saveChanges')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
} 