import Link from "next/link";
import type { ComponentProps } from "react";
import { ScopeBadge } from "./scope-badge";
import type { ScopeKey } from "@/lib/api/scopes";
import { mdxBaseComponents } from "@/components/mdx-base-components";

/**
 * Components made available to MDX guides. Authors can write
 * `<ScopeBadge scope="recent:read" />` inline and we wire it here.
 */
export const mdxComponents = {
  ...mdxBaseComponents,
  a: (props: ComponentProps<"a">) => {
    const href = props.href ?? "";
    if (href.startsWith("/")) {
      return <Link href={href}>{props.children}</Link>;
    }
    return <a {...props} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      {...props}
      className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-sm"
    />
  ),
  code: (props: ComponentProps<"code">) => (
    <code
      {...props}
      className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[0.9em] before:content-none after:content-none"
    />
  ),
  ScopeBadge: ({ scope }: { scope: ScopeKey | "public" }) => <ScopeBadge scope={scope} />,
} as const;
