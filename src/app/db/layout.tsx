import { DbLayoutClient } from "@/components/db/db-layout-client";
import { getServerSession } from "@/lib/auth-server";
import type { ReactNode } from "react";

export const TYPES = ["songs", "calculator", "stats"];

export default async function DbLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  
  return (
    <DbLayoutClient types={TYPES} user={session?.user || null}>
      {children}
    </DbLayoutClient>
  );
}

