import { Fragment, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@tomomai/ui";
import type { MarkdownExtension, MarkdownPolicy } from "./types";

export const PROFILE_MARKDOWN_POLICY: MarkdownPolicy = {
  allowedElements: ["p", "br", "strong", "em", "del", "ul", "ol", "li", "blockquote", "code", "a"],
  allowHttpsLinks: true,
};

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
};

function prepareSafeMarkdown() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.children) {
        // A fenced code block is represented as a block-level `code` node.
        // Inline code uses `inlineCode` and remains allowed by policy.
        node.children = node.children.filter((child) => child.type !== "code");
        for (const child of node.children) visit(child);
      }
      if (node.type !== "paragraph" || node.children?.length !== 1) return;
      const child = node.children[0];
      const candidate = child.type === "text"
        ? child.value
        : child.type === "link" && child.children?.length === 1 && child.children[0].type === "text"
          && child.children[0].value === child.url
          ? child.url
          : undefined;
      if (!candidate) return;
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, "data-standalone-url": candidate },
      };
    };
    visit(tree);
  };
}

function parseHttpsUrl(value: string, policy: MarkdownPolicy): URL | null {
  if (!policy.allowHttpsLinks) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function renderExtension(url: URL, extensions: readonly MarkdownExtension[]): ReactNode | null {
  for (const extension of extensions) {
    const resolved = extension.resolveStandaloneUrl(url);
    if (resolved !== null) return extension.render(resolved);
  }
  return null;
}

export function MarkdownContent({
  value,
  className,
  policy,
  extensions = [],
}: {
  value: string;
  className?: string;
  policy: MarkdownPolicy;
  extensions?: readonly MarkdownExtension[];
}) {
  const Paragraph = ({ children, ...props }: ComponentPropsWithoutRef<"p"> & { "data-standalone-url"?: string }) => {
    const standaloneUrl = props["data-standalone-url"];
    if (standaloneUrl) {
      const parsed = parseHttpsUrl(standaloneUrl, policy);
      if (parsed) {
        const rendered = renderExtension(parsed, extensions);
        if (rendered !== null) return <Fragment>{rendered}</Fragment>;
      }
    }
    return <p className="mb-3 leading-relaxed last:mb-0" {...props}>{children}</p>;
  };

  const SafeLink = ({ href, children }: ComponentPropsWithoutRef<"a">) => {
    if (!href || !parseHttpsUrl(href, policy)) return <Fragment>{children}</Fragment>;
    return (
      <a
        href={href}
        className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        target="_blank"
        rel="nofollow ugc noopener noreferrer"
      >
        {children}
      </a>
    );
  };

  return (
    <div className={cn("text-sm text-muted-foreground [&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:border-border [&_blockquote]:pl-4 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_li]:leading-relaxed [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, prepareSafeMarkdown]}
        skipHtml
        allowedElements={[...policy.allowedElements]}
        unwrapDisallowed
        urlTransform={(url) => parseHttpsUrl(url, policy)?.href ?? null}
        components={{ p: Paragraph, a: SafeLink }}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
