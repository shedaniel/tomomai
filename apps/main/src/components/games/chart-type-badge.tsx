"use client";

import Image from "next/image";
import { useGameId } from "@/components/providers/game-provider";
import { resolveImageUrl } from "@/lib/images";
import { getGameChartType } from "@/lib/games/presentation";
import { cn } from "@/lib/utils";

const IMAGE_SIZES = {
  xs: { width: 32, height: 10, className: "drop-shadow-md" },
  sm: { width: 32, height: 10, className: "h-2.5 w-auto" },
  md: { width: 37, height: 11, className: "drop-shadow-md" },
  lg: { width: 64, height: 20, className: "drop-shadow-sm" },
} as const;

export type ChartTypeBadgeSize = keyof typeof IMAGE_SIZES;

/**
 * The chart type of a score or catalog chart. Renders nothing for a type every chart of the game has.
 * `variant="label"` shows the text chip even when the type has a badge image.
 */
export function ChartTypeBadge({ typeCode, size = "sm", variant = "badge", className }: {
  typeCode: number;
  size?: ChartTypeBadgeSize;
  variant?: "badge" | "label";
  className?: string;
}) {
  const chartType = getGameChartType(useGameId(), typeCode);
  if (chartType.implicit) return null;

  if (variant === "badge" && chartType.badgePath) {
    const { width, height, className: sizeClassName } = IMAGE_SIZES[size];
    return (
      <Image
        src={resolveImageUrl(`${process.env.NEXT_PUBLIC_R2_URL}/${chartType.badgePath}`)}
        alt={chartType.label}
        width={width}
        height={height}
        className={cn(sizeClassName, className)}
        unoptimized
      />
    );
  }

  return (
    <span className={cn("inline-block w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", chartType.classes.chip, className)}>
      {chartType.label}
    </span>
  );
}
