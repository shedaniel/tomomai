import Image from "next/image";
import type { ComponentPropsWithoutRef } from "react";

export const mdxBaseComponents = {
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-2xl font-bold mt-8 mb-4" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-xl font-semibold mt-6 mb-3" {...props} />
  ),
  h4: (props: ComponentPropsWithoutRef<"h4">) => (
    <h4 className="text-base font-semibold mt-4 mb-2" {...props} />
  ),
  p: (props: ComponentPropsWithoutRef<"p">) => (
    <p className="text-muted-foreground leading-relaxed mb-4" {...props} />
  ),
  ul: (props: ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc pl-6 mb-4 space-y-1 text-muted-foreground" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal pl-6 mb-4 space-y-1 text-muted-foreground" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  hr: () => <hr className="my-8 border-border" />,
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto my-6 rounded-lg border border-border">
      <table className="w-full text-sm border-collapse" {...props} />
    </div>
  ),
  thead: (props: ComponentPropsWithoutRef<"thead">) => (
    <thead className="border-b border-border bg-muted/50" {...props} />
  ),
  tbody: (props: ComponentPropsWithoutRef<"tbody">) => (
    <tbody className="divide-y divide-border" {...props} />
  ),
  tr: (props: ComponentPropsWithoutRef<"tr">) => (
    <tr className="hover:bg-muted/40 transition-colors" {...props} />
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => (
    <th className="px-4 py-2 text-left font-semibold text-foreground" {...props} />
  ),
  td: (props: ComponentPropsWithoutRef<"td">) => (
    <td className="px-4 py-2 text-muted-foreground" {...props} />
  ),
  img: (props: ComponentPropsWithoutRef<"img">) => (
    <Image
      src={(props.src as string) || ""}
      alt={props.alt || ""}
      width={800}
      height={600}
      className="rounded-lg my-6 w-[70%] h-auto max-h-[32rem] object-contain mx-auto"
      sizes="70vw"
    />
  ),
} as const;
