"use client";

import { Flag, Ship } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Region } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select-friendly";
import { cn } from "@/lib/utils";

interface RegionSwitcherProps {
  header?: boolean;
  value: Region;
  onChange: (region: Region) => void;
}

export function RegionSwitcher({ header = false, value, onChange }: RegionSwitcherProps) {
  const t = useTranslations();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger variant="secondary" size="sm" className={cn(header && "bg-background")}>
        <SelectValue>{value === "intl" ? (<div className="flex items-center justify-between gap-2 whitespace-nowrap">
          <Ship className="h-4 w-4" />
          {t('regions.short.intl')}
        </div>) : (<div className="flex items-center justify-between gap-2 whitespace-nowrap">
          <Flag className="h-4 w-4" />
          {t('regions.short.jp')}
        </div>)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="intl">
          <div className="flex items-center justify-between gap-2 whitespace-nowrap">
            <Ship className="h-4 w-4" />
            {t('regions.intl')}
          </div>
        </SelectItem>
        <SelectItem value="jp">
          <div className="flex items-center justify-between gap-2 whitespace-nowrap">
            <Flag className="h-4 w-4" />
            {t('regions.jp')}
          </div>
        </SelectItem>
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