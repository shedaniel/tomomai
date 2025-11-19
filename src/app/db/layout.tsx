import { DbLayoutClient } from "@/components/db/db-layout-client";
import type { ReactNode } from "react";

export const TYPES = ["home", "arcades", "songs", "dans", "calculator", "kop"];

export default function DbLayout({ children }: { children: ReactNode }) {
  return (
    <DbLayoutClient types={TYPES}>
      {children}
    </DbLayoutClient>
  );
}

