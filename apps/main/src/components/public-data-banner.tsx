import { RegionSwitcherClient } from "@/components/region-switcher";
import { Badge } from "@tomomai/ui";
import { getVersionInfo, VersionId } from "@tomomai/catalog/metadata";
import { Region } from "@/lib/types";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";

interface PublicDataBannerProps {
  region: Region;
  snapshotData: {
    fetchedAt: Date;
    displayName: string;
    rating: number;
    gameVersion: VersionId;
  } | null;
  profileUsername: string;
}

export function PublicDataBanner({
  region,
  snapshotData,
  profileUsername,
}: PublicDataBannerProps) {
  const t = useTranslations();

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  return (
    <div className="border-b pb-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
        {/* Left side - Latest snapshot info */}
        <div className="flex items-center space-x-4">
          {snapshotData ? (
            <div className="flex flex-col items-start gap-1.5">
              <div className="flex items-center gap-2">
                <h1 className="m-0 text-base font-medium">{snapshotData.displayName}</h1>
                <Badge variant="tonal" className="font-medium bg-primary-container/50">{snapshotData.rating} rating</Badge>
                <Badge variant="secondary" className="font-normal bg-secondary/50">{getVersionInfo(snapshotData.gameVersion)?.shortName || "Unknown"}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{t('dataBanner.dataSnapshot')} {snapshotData ? formatDate(snapshotData.fetchedAt) : ''}</span>
            </div>
          ) : (
            <Badge variant="secondary">{t('dataBanner.noDataAvailable')}</Badge>
          )}
        </div>

        {/* Right side - Profile info */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span>{profileUsername}</span>
          </div>
          <RegionSwitcherClient
            value={region}
            username={profileUsername}
          />
        </div>
      </div>
    </div>
  );
}
