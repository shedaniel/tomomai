import { RegionSwitcherClient } from "@/components/region-switcher";
import { Badge } from "@/components/ui/badge";
import { getVersionInfo, VersionId } from "@/lib/metadata";
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
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">{t('dataBanner.dataSnapshot')} {snapshotData ? formatDate(snapshotData.fetchedAt) : ''}</span>
              <span className="text-xs text-muted-foreground">
                {snapshotData.displayName} • {snapshotData.rating} rating • {getVersionInfo(snapshotData.gameVersion)?.shortName || "Unknown"}
              </span>
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
