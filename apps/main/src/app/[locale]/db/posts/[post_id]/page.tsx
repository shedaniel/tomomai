import { getAllPostsMeta, getPostBySlug, getAvailableTranslations } from "@/lib/posts";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { defaultLocale } from "@tomomai/i18n/locale";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Metadata } from "next";
import { breadcrumbJsonLd, openGraphLocales, localizePath, ogImageUrl } from "@/lib/seo";
import { resolveBaseUrl } from "@/lib/base-url";
import { Link } from "@/i18n/navigation"
import { notFound } from "next/navigation";
import { ComponentPropsWithoutRef } from "react";
import { PostLocaleSwitcher } from "@/components/post-locale-switcher";
import { getTranslations } from "next-intl/server";
import { Bot } from "lucide-react";
import { isCNExclusive } from "@/lib/enabled-regions";
import { MdxImageComparison } from "@/components/mdx-image-comparison";
import { MdxImageCarousel, MdxImageCarouselSlide } from "@/components/mdx-image-carousel";
import { mdxBaseComponents } from "@/components/mdx-base-components";
import remarkGfm from "remark-gfm";

type PostPageProps = {
  params: Promise<{
    locale: string;
    post_id: string;
  }>;
};

export async function generateStaticParams() {
  const posts = getAllPostsMeta("en");
  return posts.map((post) => ({ post_id: post.slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { locale: localeParam, post_id } = await params;
  await setStaticLocale(localeParam);
  const locale = await getLocale();
  const post = getPostBySlug(post_id, locale);
  if (!post) return {};

  const url = `/db/posts/${post.slug}`;
  const translations = getAvailableTranslations(post.canonicalSlug);

  const languages: Record<string, string> = {};
  for (const lang of translations) {
    languages[lang] = localizePath(url, lang);
  }
  languages["x-default"] = localizePath(url, defaultLocale);

  return {
    title: `${post.title} | tomomai`,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url: localizePath(url, locale),
      siteName: "tomomai ともマイ",
      publishedTime: post.date,
      images: [{ url: ogImageUrl(url, locale) }],
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: `${post.title} | tomomai`,
      description: post.summary,
    },
    alternates: {
      canonical: localizePath(url, locale),
      languages,
    },
  };
}

const mdxComponents = {
  ...mdxBaseComponents,
  a: (props: ComponentPropsWithoutRef<"a">) => (
    <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
};

export default async function PostPage({ params }: PostPageProps) {
  const { locale: localeParam, post_id } = await params;
  await setStaticLocale(localeParam);
  const locale = await getLocale();
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
  const localizedPath = localizePath(`/db/posts/${post.slug}`, locale);
  const postUrl = `${baseUrl}${localizedPath}`;
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
    { name: tNav("posts"), url: `${baseUrl}${localizePath("/db/posts", locale)}` },
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
