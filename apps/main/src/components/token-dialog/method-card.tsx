"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@tomomai/ui";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function MethodCard({ icon: Icon, title, badge, description, onClick, disabled }: {
  icon: LucideIcon;
  title: string;
  badge?: { label: string; variant: "default" | "secondary" };
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full p-4 border-2 rounded-lg text-left group transition-all",
        disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary hover:bg-accent/50",
      )}
    >
      <div className="flex items-start space-x-3">
        <div className="mt-1 p-2 rounded-md bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <span className="font-semibold text-base">{title}</span>
            {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
        {!disabled && <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />}
      </div>
    </button>
  );
}
