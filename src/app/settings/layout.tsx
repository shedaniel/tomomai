import { getServerSession } from "@/lib/auth-server";
import { SettingsSidebar } from "@/components/settings/sidebar";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { useFlags } from "@/lib/flags";
import { cookies } from "next/headers";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();
  const flags = await useFlags(cookies);

  if (!session) {
    redirect("/");
  }

  return (
    <div className="container mx-auto max-w-200 px-4 py-8 overflow-x-hidden">
      <div className="mb-8">
        <Link href="/">
          <Image
            src="/icon.webp"
            alt="tomomai"
            width={4320}
            height={1080}
            priority
            className="h-11 w-auto dark:hidden"
            style={{ aspectRatio: "4320 / 1080" }}
          />
          <Image
            src="/icon-dark.webp"
            alt="tomomai"
            width={4320}
            height={1080}
            priority
            className="h-11 w-auto hidden dark:block"
            style={{ aspectRatio: "4320 / 1080" }}
          />
        </Link>
      </div>

      <div className="flex sm:flex-row flex-col gap-8">
        <aside className="shrink-0">
          <SettingsSidebar flags={flags} />
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
