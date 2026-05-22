import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsSection({
  divider = true,
  className,
  children,
}: {
  divider?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn(divider && "mt-6 border-t pt-6", className)}>{children}</div>;
}
