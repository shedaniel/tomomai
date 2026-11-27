"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { resolveImageUrl } from "@/lib/images";

/** A plain image that disappears when it fails, so the card's placeholder shows instead of a broken icon. */
export function NetImage({ src, alt = "", ...props }: Omit<ComponentProps<"img">, "src"> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  // An image can fail before hydration attaches onError.
  useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return null;
  // eslint-disable-next-line @next/next/no-img-element -- art comes from many hosts, some unproxied
  return <img ref={ref} src={resolveImageUrl(src)} alt={alt} onError={() => setFailed(true)} {...props} />;
}
