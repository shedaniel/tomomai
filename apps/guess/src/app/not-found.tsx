import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/SiteHeader";
import { NotFoundCta } from "@/components/NotFoundCta";

export default async function NotFound() {
  const t = await getTranslations("guess.notFound");
  return (
    <div className="container mx-auto max-w-md px-4 min-h-dvh flex flex-col">
      <SiteHeader />
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-6 pb-12">
        <div className="text-8xl font-black tabular-nums text-foreground/90 leading-none">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground text-balance">{t("description")}</p>
        </div>
        <NotFoundCta label={t("button")} />
      </div>
    </div>
  );
}
