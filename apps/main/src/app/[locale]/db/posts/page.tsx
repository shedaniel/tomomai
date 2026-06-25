import { getAllPostsMeta } from "@/lib/posts";
import { getLocale, setStaticLocale } from "@/i18n/locale-server";
import { localizePath, buildAlternates, openGraphLocales } from "@/lib/seo";
import { Metadata } from "next";
import { Link } from "@/i18n/navigation"
import { getTranslations } from "next-intl/server";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  await setStaticLocale(locale);
  const [t, currentLocale] = await Promise.all([
    getTranslations("db.posts.list"),
    getLocale(),
  ]);
  const title = `${t("title")} | tomomai`;
  const description = t("description");

  return {
    title,
    description,
    alternates: await buildAlternates("/db/posts"),
    openGraph: {
      title: t("title"),
      description,
      type: "website",
      url: localizePath("/db/posts", currentLocale),
      siteName: "tomomai ともマイ",
      ...openGraphLocales(currentLocale),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PostsPage({ params }: Props) {
  const { locale } = await params;
  await setStaticLocale(locale);
  const currentLocale = await getLocale();
  const posts = getAllPostsMeta(currentLocale);
  const t = await getTranslations("db.posts.list");

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-muted-foreground mb-10">
        {t("description")}
      </p>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">{t("noPosts")}</p>
      ) : (
        <div className="relative border-l-2 border-border pl-8 space-y-10">
          {posts.map((post) => (
            <div key={post.slug} className="relative">
              <div className="absolute -left-[calc(2rem+5px)] top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString(currentLocale, {
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

                <h2 className="text-xl font-semibold">
                  <Link
                    href={`/db/posts/${post.slug}`}
                    className="hover:underline"
                  >
                    {post.title}
                  </Link>
                </h2>

                <p className="text-muted-foreground text-sm">
                  {post.summary}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
