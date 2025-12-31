import { DbLayoutClient } from "@/components/db/db-layout-client";
import { getServerSession } from "@/lib/auth-server";
import { DB_TYPES } from "@/lib/db/types";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function DbLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();

  return (
    <DbLayoutClient types={DB_TYPES} user={session?.user || null}>
      {children}
    </DbLayoutClient>
  );
}
