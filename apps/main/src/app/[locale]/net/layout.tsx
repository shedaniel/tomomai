import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { M_PLUS_Rounded_1c, Mochiy_Pop_One } from "next/font/google";
import { NetIntlProvider } from "@/components/net/net-intl-provider";
import { setStaticLocale } from "@/i18n/locale-server";
import { useAprilFools2027 as isNetOpen } from "@/lib/flags";
import { requireFrontendGame } from "@/lib/games/current";

const mochiy = Mochiy_Pop_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--net-font-pop",
  display: "swap",
  preload: false,
});

const mPlusRounded = M_PLUS_Rounded_1c({
  weight: ["400", "500", "700", "800"],
  subsets: ["latin"],
  variable: "--net-font-jp",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "tomomai NET",
  robots: { index: false, follow: false },
};

export default async function NetLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  requireFrontendGame("maimai");
  if (!(await isNetOpen())) notFound();
  await setStaticLocale((await params).locale);
  return (
    <div className={`${mochiy.variable} ${mPlusRounded.variable}`}>
      <span data-hide-site-footer hidden />
      <NetIntlProvider>{children}</NetIntlProvider>
    </div>
  );
}
