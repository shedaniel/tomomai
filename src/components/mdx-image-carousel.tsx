"use client"

import Image from "next/image"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
} from "@/components/ui/carousel"
import { type ReactNode } from "react"

export function MdxImageCarousel({ children }: { children: ReactNode }) {
  return (
    <Carousel className="my-6 w-[80%] mx-auto">
      <CarouselContent>
        {children}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}

export function MdxImageCarouselSlide({
  src,
  alt = "",
  caption,
}: {
  src: string
  alt?: string
  caption?: string
}) {
  return (
    <CarouselItem>
      <div className="flex flex-col items-center gap-2">
        <Image
          src={src}
          alt={alt}
          width={800}
          height={600}
          className="rounded-lg w-auto max-w-full max-h-[32rem]"
          draggable={false}
        />
        {caption && (
          <p className="text-sm text-muted-foreground">{caption}</p>
        )}
      </div>
    </CarouselItem>
  )
}
