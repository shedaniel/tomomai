"use client";

import { isR2Url, resolveImageUrl } from "@/lib/images";
import Image, { ImageProps } from "next/image";

type CoverImageProps = Omit<ImageProps, "src"> & {
  coverUrl: string;
};

export function CoverImage({ coverUrl, ...props }: CoverImageProps) {
  const src = resolveImageUrl(coverUrl);
  return <Image src={src} unoptimized={isR2Url(coverUrl)} {...props} />;
}
