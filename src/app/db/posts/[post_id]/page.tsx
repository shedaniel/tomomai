import { getAllPostsMeta, getPostBySlug, getAvailableTranslations } from "@/lib/posts";
import { getLocale } from "@/i18n/locale-server";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Metadata } from "next";
import { buildAlternates, breadcrumbJsonLd, openGraphLocales, withTl } from "@/lib/seo";
import { resolveBaseUrl } from "@/lib/base-url";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ComponentPropsWithoutRef } from "react";
import { PostLocaleSwitcher } from "@/components/post-locale-switcher";
import { getTranslations } from "next-intl/server";
import { Bot } from "lucide-react";
import { isCNExclusive } from "@/lib/enabled-regions";
import { MdxImageComparison } from "@/components/mdx-image-comparison";
import { MdxImageCarousel, MdxImageCarouselSlide } from "@/components/mdx-image-carousel";
import remarkGfm from "remark-gfm";

type PostPageProps = {
  params: Promise<{
    post_id: string;
  }>;
};

export async function generateStaticParams() {
  // Generate params for all posts (using English as base)
  // The actual locale will be determined at runtime from cookie/header
  const posts = getAllPostsMeta("en");
  return posts.map((post) => ({ post_id: post.slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const locale = await getLocale();
  const { post_id } = await params;
  const post = getPostBySlug(post_id, locale);
  if (!post) return {};

  const url = `/db/posts/${post.slug}`;
  const translations = getAvailableTranslations(post.canonicalSlug);

  // Hreflang: link each translated locale to `?tl=<locale>` on the same slug;
  // locales without a translation aren't advertised.
  const languages: Record<string, string> = {};
  for (const lang of translations) {
    languages[lang] = withTl(url, lang);
  }
  languages["x-default"] = url;

  return {
    title: `${post.title} | tomomai`,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url,
      siteName: "tomomai ともマイ",
      publishedTime: post.date,
      images: [{ url: `/db/posts/${post.slug}/opengraph-image`, width: 1200, height: 630 }],
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | tomomai`,
      description: post.summary,
    },
    alternates: {
      canonical: url,
      languages,
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
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
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
      src={props.src as string || ""}
      alt={props.alt || ""}
      width={800}
      height={600}
      className="rounded-lg my-6 w-[70%] h-auto max-h-[32rem] object-contain mx-auto"
    />
  ),
};

export default async function PostPage({ params }: PostPageProps) {
  const locale = await getLocale();
  const { post_id } = await params;
  const post = getPostBySlug(post_id, locale);

  if (!post) {
    notFound();
  }

  const tPost = await getTranslations("db.posts");
  const AITranslationHint = () => (
    <div className="flex gap-3 rounded-lg border border-border bg-muted px-4 py-3 text-sm my-6">
      <Bot className="mt-0.5 shrink-0" size={18} />
      <div>
        <p className="font-semibold">{tPost("aiTranslationHint.title")}</p>
        <p className="mt-0.5">{tPost("aiTranslationHint.description")}</p>
      </div>
    </div>
  );

  const availableTranslations = getAvailableTranslations(post.canonicalSlug);

  const baseUrl = resolveBaseUrl();
  const postUrl = `${baseUrl}/db/posts/${post.slug}`;
  const tNav = await getTranslations("db.types");

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.summary,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: post.locale,
    mainEntityOfPage: { "@type": "WebPage", "@id": postUrl },
    author: { "@type": "Organization", name: "tomomai", url: baseUrl },
    publisher: {
      "@type": "Organization",
      name: "tomomai",
      logo: { "@type": "ImageObject", url: `${baseUrl}/icon.png` },
    },
    image: `${postUrl}/opengraph-image`,
  };

  const breadcrumb = breadcrumbJsonLd([
    { name: "tomomai", url: `${baseUrl}/` },
    { name: tNav("posts"), url: `${baseUrl}/db/posts` },
    { name: post.title, url: postUrl },
  ]);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }}
      />
      {/* Header with back link and language switcher */}
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/db/posts"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          &larr; Back to Changelog
        </Link>

        {/* Language switcher (only shows if multiple translations exist) */}
        {!isCNExclusive() && <PostLocaleSwitcher
          availableLocales={availableTranslations}
          currentLocale={post.locale}
        />}
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <time dateTime={post.date}>
            {new Date(post.date).toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {post.version && post.version !== "N/A" && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              v{post.version}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold">{post.title}</h1>
        <p className="text-muted-foreground mt-2">{post.summary}</p>
      </div>

      <hr className="border-border mb-8" />

      <article className="prose-custom">
        <MDXRemote source={post.content} options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }} components={{ ...mdxComponents, AITranslationHint, ImageComparison: MdxImageComparison, ImageCarousel: MdxImageCarousel, ImageCarouselSlide: MdxImageCarouselSlide }} />
      </article>
    </div>
  );
}
