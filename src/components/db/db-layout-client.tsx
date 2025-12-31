"use client";

import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { Fragment, type ReactNode, useEffect, useRef, useTransition } from "react";

function TypeSelector({
  currentType,
  types,
  onStartTransition,
  onPrefetch,
}: {
  currentType: string;
  types: readonly string[];
  onStartTransition: (href: string) => void;
  onPrefetch: (href: string) => void;
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
              onClick={() => !isActive && onStartTransition(href)}
              onMouseEnter={() => onPrefetch(href)}
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

const variants = {
  initial: { opacity: 0.5, filter: "blur(4px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0.5, filter: "blur(4px)" },
};

import { Info } from "lucide-react";

function BetaBanner() {
  const t = useTranslations("db.beta");

  return (
    <div className="bg-muted/50 text-muted-foreground border border-foreground dark:border-border px-4 py-3 rounded-lg mb-8 flex items-start gap-3">
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
}: {
  user: User | null;
  children: ReactNode;
  types: readonly string[];
}) {
  const segments = useSelectedLayoutSegments();
  const currentType = (segments[0] as string | undefined) ?? "home";

  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const isFirstRender = useRef(true);

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  const handleNavigate = (href: string) => {
    startTransition(() => {
      router.push(href, { scroll: false });
    });
  };

  return (
    <div className="container mx-auto max-w-[1300px] px-4 pt-8">
      <Header currentTab="db" showDiscordBanner={false}
        user={user ? {
          user,
          menu: null,
        } : undefined}
      />

      <BetaBanner />

      <TypeSelector
        currentType={currentType}
        types={types}
        onStartTransition={(href) => handleNavigate(href)}
        onPrefetch={(href) => router.prefetch(href)}
      />

      <Separator className="my-4" />

      <div className="relative min-h-[50vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentType}
            variants={!isFirstRender.current ? variants : undefined}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="min-h-[50vh]"
          >
            {isPending ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground/50" />
              </div>
            ) : (
              children
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
