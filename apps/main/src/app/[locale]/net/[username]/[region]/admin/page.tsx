import { NetStaffDoor } from "@/components/net/hidden/net-staff-door";
import { setStaticLocale } from "@/i18n/locale-server";
import type { NetPageParams } from "@/lib/net/player";

export const dynamic = "force-dynamic";

export default async function NetAdminPage({ params }: NetPageParams) {
  await setStaticLocale((await params).locale);
  return <NetStaffDoor />;
}
