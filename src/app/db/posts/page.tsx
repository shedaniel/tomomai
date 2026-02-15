import { getAllPostsMeta } from "@/lib/posts";
import { getLocale } from "@/i18n/locale-server";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Changelog | tomomai",
  description: "Latest updates and changes to tomomai.",
  openGraph: {
    title: "Changelog",
    description: "Latest updates and changes to tomomai.",
    type: "website",
    url: "/db/posts",
  },
  twitter: {
    card: "summary",
    title: "Changelog | tomomai",
    description: "Latest updates and changes to tomomai.",
  },
  alternates: {
    canonical: "/db/posts",
  },
};

export default async function PostsPage() {
  const locale = await getLocale();
  const posts = getAllPostsMeta(locale);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-2">Changelog</h1>
      <p className="text-muted-foreground mb-10">
        Latest updates and changes to tomomai.
      </p>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No posts yet.</p>
      ) : (
        <div className="relative border-l-2 border-border pl-8 space-y-10">
          {posts.map((post) => (
            <div key={post.slug} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[calc(2rem+5px)] top-1.5 h-3 w-3 rounded-full bg-primary border-2 border-background" />

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
