"use client"

import Image from "next/image"
import { Comparison, ComparisonItem, ComparisonHandle } from "@tomomai/ui"

export function MdxImageComparison({
  before,
  after,
  beforeAlt = "Before",
  afterAlt = "After",
}: {
  before: string
  after: string
  beforeAlt?: string
  afterAlt?: string
}) {
  return (
    <Comparison
      className="rounded-lg my-6 w-[70%] max-h-[32rem] mx-auto"
    >
      {/* Hidden image to establish natural aspect ratio */}
      <Image
        src={after}
        alt=""
        width={800}
        height={600}
        className="invisible w-full h-auto"
        aria-hidden="true"
        draggable={false}
      />
      <ComparisonItem position="left">
        <Image
          src={before}
          alt={beforeAlt}
          width={800}
          height={600}
          className="size-full object-contain"
          draggable={false}
        />
      </ComparisonItem>
      <ComparisonItem position="right">
        <Image
          src={after}
          alt={afterAlt}
          width={800}
          height={600}
          className="size-full object-contain"
          draggable={false}
        />
      </ComparisonItem>
      <ComparisonHandle />
    </Comparison>
  )
}
