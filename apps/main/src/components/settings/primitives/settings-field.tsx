import type { ComponentType, ReactNode } from "react";
import { Label } from "@tomomai/ui";
import { cn } from "@/lib/utils";

type IconComponent = ComponentType<{ className?: string }>;

type CommonProps = {
  icon?: IconComponent;
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  className?: string;
  labelClassName?: string;
};

type StackedProps = CommonProps & {
  layout?: "stacked";
  action?: ReactNode;
  children?: ReactNode;
};

type InlineProps = CommonProps & {
  layout: "inline";
  action: ReactNode;
  children?: ReactNode;
};

export type SettingsFieldProps = StackedProps | InlineProps;

export function SettingsField(props: SettingsFieldProps) {
  const { icon: Icon, label, description, htmlFor, action, children, className, labelClassName } = props;
  const layout = props.layout ?? "stacked";

  const labelEl = (
    <Label htmlFor={htmlFor} className={cn("flex items-center gap-2", labelClassName)}>
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </Label>
  );

  if (layout === "inline") {
    return (
      <div className={cn("grid gap-2", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            {labelEl}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-2", className)}>
      {action ? (
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            {labelEl}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="shrink-0">{action}</div>
        </div>
      ) : (
        <>
          {labelEl}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </>
      )}
      {children}
    </div>
  );
}
