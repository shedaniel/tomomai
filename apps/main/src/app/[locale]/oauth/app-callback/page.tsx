import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Smartphone } from "lucide-react";
import { Button } from "@tomomai/ui";
import { Link } from "@/i18n/navigation";

// The address carries a one-time code, so the page must never read it or hand it on to anything else.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Where the mobile app's sign-in returns when the app did not claim the link. It is deliberately
 * inert: it never reads the query string, so the code is useless to anyone who lands here.
 */
export default async function AppCallbackPage() {
  const t = await getTranslations("oauthAppCallback");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Smartphone className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("body")}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
    </main>
  );
}
