"use client";

import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useSelectedLayoutSegments } from "next/navigation";
import { Fragment, type ReactNode } from "react";

function TypeSelector({
  currentType,
  types,
}: {
  currentType: string;
  types: string[];
}) {
  return (
    <div className="flex items-center space-x-2 -mt-4 overflow-x-auto">
      {types.map((type) => (
        <Fragment key={type}>
          <Button
            variant="ghost"
            size="sm"
            asChild
            className={cn(
              "hover:bg-gray-200",
              currentType === type ? "bg-gray-200" : "",
            )}
          >
            <Link href={`/db/${type}`} scroll={false}>
              {type}
            </Link>
          </Button>
        </Fragment>
      ))}
    </div>
  );
}

export function DbLayoutClient({
  children,
  types,
}: {
  children: ReactNode;
  types: string[];
}) {
  const segments = useSelectedLayoutSegments();
  const currentType = (segments[0] as string | undefined) ?? "home";

  return (
    <div className="container mx-auto max-w-[1300px] px-4 pt-8">
      <Header iconPath="/icon-db.webp" showDiscordBanner={false} />

      <TypeSelector currentType={currentType} types={types} />

      <Separator className="mt-4 mb-2" />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentType}
          initial={{ opacity: 0.5, filter: "blur(4px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0.5, filter: "blur(4px)" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}


