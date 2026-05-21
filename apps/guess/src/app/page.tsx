import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getLocale } from "@tomomai/i18n/server";
import { GamePage } from "@/components/GamePage";
import { getDateKey } from "@/lib/date-slug";
import { buildGuessMetadata, metaNamespace } from "@/lib/metadata";

export async function generateMetadata(): Promise<Metadata> {
  const [t, locale] = await Promise.all([
    getTranslations(metaNamespace()),
    getLocale(),
  ]);
  return buildGuessMetadata({ t, locale });
}

export default function HomePage() {
  const dateKey = getDateKey();
  return <GamePage dateKey={dateKey} />;
}
