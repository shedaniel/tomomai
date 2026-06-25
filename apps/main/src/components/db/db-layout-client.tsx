"use client";

import { Header } from "@/components/header";
import { Button } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSelectedLayoutSegments } from "next/navigation";
import { Fragment, type ReactNode } from "react";

function TypeSelector({
  currentType,
  types,
}: {
  currentType: string;
  types: readonly string[];
}) {
  const t = useTranslations();

  return (
    <div className="flex items-center space-x-2 -mt-4 overflow-x-auto">
      {types.map((type) => {
        const href = `/db/${type}`;
        const isActive = currentType === type;

        return (
          <Fragment key={type}>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "hover:bg-primary! hover:text-primary-foreground!",
                isActive ? "bg-muted border" : "",
              )}
              asChild
            >
              <Link href={href} scroll={false}>
                {t(`db.types.${type}`)}
              </Link>
            </Button>
          </Fragment>
        );
      })}
    </div>
  );
}

function BetaBanner() {
  const t = useTranslations("db.beta");

  return (
    <div className="bg-muted/50 text-muted-foreground border border-foreground dark:border-border px-4 py-3 rounded-lg mb-8 flex items-start gap-3" data-nosnippet>
      <Info className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <span className="font-semibold text-sm block">{t("title")}</span>
        <p className="text-sm opacity-90">{t("description")}</p>
      </div>
    </div>
  );
}

export function DbLayoutClient({
  user,
  children,
  types,
  customThemesEnabled = false,
}: {
  user: User | null;
  children: ReactNode;
  types: readonly string[];
  customThemesEnabled?: boolean;
}) {
  const segments = useSelectedLayoutSegments();
  const currentType = (segments[0] as string | undefined) ?? "home";

  return (
    <div className="container mx-auto max-w-[1300px] px-4 pt-8">
      <Header currentTab="db" showDiscordBanner={false} customThemesEnabled={customThemesEnabled}
        user={user ? {
          user,
          menu: null,
        } : undefined}
      />

      <BetaBanner />

      <TypeSelector currentType={currentType} types={types} />

      <Separator className="my-4" />

      <div className="min-h-[50vh]">{children}</div>
    </div>
  );
}
