import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { Metadata } from "next";
import { listGuides, readGuide } from "@/lib/developer/guides";
import { mdxComponents } from "@/components/developer/mdx-components";

// Refuse slugs not produced by generateStaticParams(). Combined with the
// SLUG_RE allow-list in readGuide(), this defeats path-traversal at both the
// route and the data-layer boundary.
export const dynamicParams = false;

export async function generateStaticParams() {
  const guides = await listGuides();
  return guides.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = await readGuide(slug);
  if (!guide) return {};
  return { title: guide.title, description: guide.description };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = await readGuide(slug);
  if (!guide) notFound();

  return (
    <article className="prose prose-neutral dark:prose-invert max-w-3xl">
      <header className="space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Guide</div>
        <h1 className="text-3xl font-semibold tracking-tight">{guide.title}</h1>
        {guide.description ? (
          <p className="max-w-3xl text-muted-foreground">{guide.description}</p>
        ) : null}
      </header>
      <MDXRemote
        source={guide.content}
        components={mdxComponents}
        options={{
          mdxOptions: { remarkPlugins: [remarkGfm] },
        }}
      />
    </article>
  );
}
