import Link from "next/link";

/**
 * Minimal not-found UI rendered inline by ISR pages that hit an unknown slug
 * (e.g. /db/songs/<invalid>). Kept locale-agnostic and free of any dynamic
 * API read (no headers/cookies/next-intl) so the route stays static and
 * cheap to revalidate. The caller sets `robots: noindex` in generateMetadata
 * so these pages don't enter the search index.
 *
 * We avoid `notFound()` from next/navigation on purpose: in this app's
 * next-intl + on-demand-ISR setup, the not-found boundary render reads
 * headers and flips the route dynamic (HTTP 500).
 */
export function InlineNotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <p className="text-5xl font-semibold tracking-tight">404</p>
      <h1 className="text-xl font-medium">Song not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The song you&apos;re looking for doesn&apos;t exist or may have been removed.
      </p>
      <Link
        href="/db/songs"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Browse songs
      </Link>
    </main>
  );
}
