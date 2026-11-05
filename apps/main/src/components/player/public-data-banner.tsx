import { getCurrentGame } from "@/lib/games/current";
import { formatGameRating } from "@/lib/games/presentation";
import { RegionSwitcherClient } from "@/components/region-switcher";
import { Badge } from "@tomomai/ui";
import { getVersion } from "@/lib/games/versions";
import type { Region } from "@/lib/games/ids";
import { User, Users } from "lucide-react";
import { useTranslations } from "next-intl";

interface PublicDataBannerProps {
  region: Region;
  snapshotData: {
    fetchedAt: Date;
    displayName: string;
    rating: number;
    gameVersion: number;
  } | null;
  profileUsername: string;
  friendView?: boolean;
}

export function PublicDataBanner({
  region,
  snapshotData,
  profileUsername,
  friendView = false,
}: PublicDataBannerProps) {
  const t = useTranslations();
  const game = getCurrentGame().id;

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
                <Badge variant="tonal" className="font-medium bg-primary-container/50">{formatGameRating(game, snapshotData.rating)} rating</Badge>
                <Badge variant="secondary" className="font-normal bg-secondary/50">{getVersion(game, snapshotData.gameVersion)?.shortName || "Unknown"}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{t('dataBanner.dataSnapshot')} {snapshotData ? formatDate(snapshotData.fetchedAt) : ''}</span>
            </div>
          ) : (
            <Badge variant="secondary">{t('dataBanner.noDataAvailable')}</Badge>
          )}
        </div>

        {/* Right side - Profile info */}
        <div className="flex items-center space-x-3">
          {friendView && (
            <Badge variant="outline" className="shrink-0 gap-1 whitespace-nowrap font-normal" title={t("dataBanner.friendViewHint")}>
              <Users className="h-3 w-3" />
              {t("dataBanner.friendView")}
            </Badge>
          )}
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
