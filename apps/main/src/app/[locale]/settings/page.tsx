import { redirect } from "@/i18n/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/settings/account", locale });
}
