"use client";

import Image from "next/image";
import { useGame } from "@/components/providers/game-provider";
import { brandTitle } from "@/lib/games/frontend";
import type { BrandSection } from "@/lib/games/types";

/** The served game's wordmark for a site section, or its brand title as text when it has no artwork. */
export function BrandLogo({ section, height, priority }: { section: BrandSection; height: number; priority?: boolean }) {
  const { brand } = useGame();
  if (!brand.logos) return <span className="text-2xl font-semibold">{brandTitle(brand)}</span>;

  const { light, dark } = brand.logos.sections[section];
  const props = {
    width: brand.logos.width,
    height: brand.logos.height,
    sizes: `${Math.round((height * brand.logos.width) / brand.logos.height)}px`,
    priority,
    style: { height, width: "auto", aspectRatio: `${brand.logos.width} / ${brand.logos.height}` },
  };
  return (
    <>
      <Image src={light} alt={brand.productName} className="dark:hidden" {...props} />
      <Image src={dark} alt={brand.productName} className="hidden dark:block" {...props} />
    </>
  );
}
