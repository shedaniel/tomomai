"use client";

import { Flag, Ship } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Region } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select-friendly";
import { cn } from "@/lib/utils";
import { getEnabledRegions } from "@/lib/enabled-regions";

interface RegionSwitcherProps {
  header?: boolean;
  value: Region;
  onChange: (region: Region) => void;
}

const regionIcons: Record<Region, React.ReactNode> = {
  intl: <Ship className="h-4 w-4" />,
  jp: <Flag className="h-4 w-4" />,
  cn: <Flag className="h-4 w-4" />,
};

export function RegionSwitcher({ header = false, value, onChange }: RegionSwitcherProps) {
  const t = useTranslations();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger variant="secondary" size="sm" className={cn(header && "bg-background")}>
        <SelectValue>
          <div className="flex items-center justify-between gap-2 whitespace-nowrap">
            {regionIcons[value]}
            {t(`regions.short.${value}`)}
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {getEnabledRegions().map((region) => (
          <SelectItem key={region} value={region}>
            <div className="flex items-center justify-between gap-2 whitespace-nowrap">
              {regionIcons[region]}
              {t(`regions.${region}`)}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Client component for profile pages that handles navigation
interface RegionSwitcherClientProps {
  value: Region;
  username: string;
}

export function RegionSwitcherClient({ value, username }: RegionSwitcherClientProps) {
  const router = useRouter();

  const handleRegionChange = (newRegion: Region) => {
    if (newRegion !== value) {
      // Navigate to the new region
      router.push(`/profile/${username}/${newRegion}`);
    }
  };

  return (
    <RegionSwitcher
      value={value}
      onChange={handleRegionChange}
    />
  );
}
