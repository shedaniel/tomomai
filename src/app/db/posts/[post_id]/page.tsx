import { getAllPostsMeta, getPostBySlug } from "@/lib/posts";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComponentPropsWithoutRef } from "react";

type PostPageProps = {
  params: Promise<{
    post_id: string;
  }>;
};

export async function generateStaticParams() {
  const posts = getAllPostsMeta();
  return posts.map((post) => ({ post_id: post.slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { post_id } = await params;
  const post = getPostBySlug(post_id);
  if (!post) return {};

  return {
    title: `${post.title} | tomomai`,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
    },
  };
}

const mdxComponents = {
  h2: (props: ComponentPropsWithoutRef<"h2">) => (
    <h2 className="text-2xl font-bold mt-8 mb-4" {...props} />
  ),
  h3: (props: ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-xl font-semibold mt-6 mb-3" {...props} />
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
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  hr: () => <hr className="my-8 border-border" />,
};

export default async function PostPage({ params }: PostPageProps) {
  const { post_id } = await params;
  const post = getPostBySlug(post_id);

  if (!post) {
    notFound();
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/db/posts"
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-1"
      >
        &larr; Back to Changelog
      </Link>

      <div className="mb-8 mt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            v{post.version}
          </span>
        </div>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <p className="text-muted-foreground mt-2">{post.summary}</p>
      </div>

      <hr className="border-border mb-8" />

      <article className="prose-custom">
        <MDXRemote source={post.content} components={mdxComponents} />
      </article>
    </div>
  );
}
