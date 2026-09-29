"use client";

import Image from "next/image";
import { getRatingImageUrl } from "@/lib/games/maimai/assets";
import { formatGameRating } from "@/lib/games/presentation";

export function MaimaiRatingPlate({ rating, version }: { rating: number; version: number }) {
  return (
    <>
      <Image
        src={getRatingImageUrl(rating, version)}
        alt={rating.toString()}
        width={120}
        height={35}
        crossOrigin="anonymous"
      />
      <span className="absolute top-[3px] left-[8px] box-border w-[106px] text-right font-mono text-[18px] font-normal tracking-[1.65px] text-white">
        {formatGameRating("maimai", rating)}
      </span>
    </>
  );
}
