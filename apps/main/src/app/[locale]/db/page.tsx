import { redirect } from "@/i18n/navigation";

export default async function DbPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/db/songs", locale });
}
