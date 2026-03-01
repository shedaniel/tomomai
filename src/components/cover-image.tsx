"use client";

import { createSafeMaimaiImageUrl, isR2Url } from "@/lib/utils";
import Image, { ImageProps } from "next/image";

type CoverImageProps = Omit<ImageProps, "src"> & {
  coverUrl: string;
};

export function CoverImage({ coverUrl, ...props }: CoverImageProps) {
  const src = createSafeMaimaiImageUrl(coverUrl);
  return <Image src={src} unoptimized={isR2Url(coverUrl)} {...props} />;
}
