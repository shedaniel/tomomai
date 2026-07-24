import { Link } from "@/i18n/navigation"
import { ExternalMarkdownLink, markdownBaseComponents } from "@tomomai/markdown";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, Info, CheckCircle2, AlertCircle } from "lucide-react";
import { ScopeBadge } from "./scope-badge";
import type { ScopeKey } from "@/lib/api/scopes";

type CalloutType = "info" | "warning" | "danger" | "success";

const CALLOUT_STYLES: Record<
  CalloutType,
  { wrap: string; icon: typeof Info; iconClass: string; title: string }
> = {
  info: {
    wrap: "border-border bg-muted/40",
    icon: Info,
    iconClass: "text-muted-foreground",
    title: "text-foreground",
  },
  warning: {
    wrap: "border-foreground/30 bg-muted/60",
    icon: AlertTriangle,
    iconClass: "text-foreground",
    title: "text-foreground",
  },
  danger: {
    wrap: "border-destructive/50 bg-destructive/10",
    icon: AlertCircle,
    iconClass: "text-destructive",
    title: "text-destructive",
  },
  success: {
    wrap: "border-primary/40 bg-primary/5",
    icon: CheckCircle2,
    iconClass: "text-primary",
    title: "text-foreground",
  },
};

function Callout({
  type = "info",
  title,
  children,
}: {
  type?: CalloutType;
  title?: string;
  children?: ReactNode;
}) {
  const style = CALLOUT_STYLES[type];
  const Icon = style.icon;
  return (
    <div className={`my-6 flex gap-3 rounded-lg border px-4 py-3 ${style.wrap}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${style.iconClass}`} />
      <div className="min-w-0 flex-1 [&_p:last-child]:mb-0 [&_table]:my-3">
        {title ? (
          <div className={`mb-1 font-semibold ${style.title}`}>{title}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/**
 * Components made available to MDX guides. Authors can write
 * `<ScopeBadge scope="recent:read" />` inline and we wire it here.
 */
export const mdxComponents = {
  ...markdownBaseComponents,
  a: (props: ComponentProps<"a">) => {
    const href = props.href ?? "";
    const isHttp = href.startsWith("http://") || href.startsWith("https://");
    const isMailto = href.startsWith("mailto:");
    if (href.startsWith("/")) {
      return <Link href={href}>{props.children}</Link>;
    }
    if (isHttp) {
      return <ExternalMarkdownLink {...props} />;
    }
    if (!isMailto) {
      return <span>{props.children}</span>;
    }
    return <a {...props} rel="noopener noreferrer" />;
  },
  pre: (props: ComponentProps<"pre">) => (
    <pre
      {...props}
      className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-sm"
    />
  ),
  code: ({ className, children, ...props }: ComponentProps<"code">) => {
    const hasLanguageClass = typeof className === "string" && className.length > 0;
    const hasNewline = typeof children === "string" && children.includes("\n");
    if (hasLanguageClass || hasNewline) {
      return <code {...props} className={className}>{children}</code>;
    }
    return (
      <code
        {...props}
        className="rounded-sm bg-muted px-2 py-0.5 font-mono text-[0.9em] before:content-none after:content-none"
      >
        {children}
      </code>
    );
  },
  ScopeBadge: ({ scope }: { scope: ScopeKey | "public" }) => <ScopeBadge scope={scope} />,
  Callout,
} as const;
