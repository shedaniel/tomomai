"use client"

import {
  Select as SelectPrimitive,
  SelectContent as SelectPrimitiveContent,
  SelectItem as SelectPrimitiveItem,
  SelectTrigger as SelectPrimitiveTrigger,
  SelectValue as SelectPrimitiveValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"
import { Check, ChevronDown } from "lucide-react"
import * as React from "react"
import ReactDOM from "react-dom"
import { Button, type buttonVariants } from "./button"
import { VariantProps } from "class-variance-authority"

interface SelectContextValue<T extends string> {
  isMobile: boolean
  sheetOpen: boolean
  setSheetOpen: (open: boolean) => void
  value: T | null;
  setValue: (v: T) => void;
  valueNode: HTMLElement | null;
  setValueNode: (el: HTMLElement | null) => void;
  valueNodeHasChildren: boolean;
  setValueNodeHasChildren: (b: boolean) => void;
  disabled?: boolean;
}

const SelectContext = React.createContext<SelectContextValue<string> | null>(null)
const SheetHiddenContext = React.createContext<boolean>(false)

function useSelectContext<T extends string>(): SelectContextValue<T> {
  const ctx = React.useContext(SelectContext)
  if (!ctx) throw new Error("SelectFriendly components must be inside <SelectFriendly>")
  return ctx as unknown as SelectContextValue<T>
}

function useSheetHiddenContext() {
  return React.useContext(SheetHiddenContext)
}

// Root component
interface SelectProps<T extends string> {
  value?: T
  onValueChange?: (value: T) => void
  children: React.ReactNode
  disabled?: boolean
}

function Select<T extends string>({ value, onValueChange, children, disabled }: SelectProps<T>) {
  const isMobile = useMediaQuery("(max-width: 768px)", {
    defaultValue: false,
    initializeWithValue: false, // Prevent hydration mismatch by matching server render
  })
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [valueNode, setValueNode] = React.useState<HTMLElement | null>(null);
  const [valueNodeHasChildren, setValueNodeHasChildren] = React.useState(false);

  return (
    <SelectContext.Provider value={{
      isMobile,
      sheetOpen,
      setSheetOpen,
      value: value ?? null,
      setValue: onValueChange as (v: string) => void,
      valueNode,
      setValueNode,
      valueNodeHasChildren,
      setValueNodeHasChildren,
      disabled,
    }}>
      {isMobile ? (<>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>{children}</Sheet>
        {/* <SelectItemPortalManager /> */}
      </>) : (
        <SelectPrimitive value={value} onValueChange={onValueChange} disabled={disabled}>
          {children}
        </SelectPrimitive>
      )}
    </SelectContext.Provider>
  )
}

// --- TRIGGER ---
interface SelectTriggerProps extends React.ComponentProps<"button"> {
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  className?: string
  children?: React.ReactNode
}

function SelectTrigger({ className, children, variant, size, ...props }: SelectTriggerProps) {
  const { isMobile } = useSelectContext()

  if (isMobile) {
    return (
      <SheetTrigger asChild>
        <Button
          type="button"
          variant={variant || "outline"}
          size={size || "sm"}
          aria-haspopup="dialog"
          aria-expanded="false"
          className={cn(
            "flex items-center justify-between rounded-md border border-input bg-background",
            className
          )}
          {...props}
        >
          {children}
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </SheetTrigger>
    )
  }

  return (
    <SelectPrimitiveTrigger className={cn("w-full h-8 space-x-2", className)} {...props}>
      {children}
    </SelectPrimitiveTrigger>
  )
}

interface SelectValueProps extends React.ComponentProps<"span"> {
  placeholder?: React.ReactNode;
  children?: React.ReactNode;
}

function SelectValue({ placeholder, children, ...props }: SelectValueProps) {
  const ctx = useSelectContext()
  const hasChildren = children !== undefined;

  const ref = React.useCallback((el: HTMLElement | null) => {
    ctx.setValueNode(el);
  }, [])

  React.useLayoutEffect(() => {
    ctx.setValueNodeHasChildren(hasChildren);
  }, [ctx, hasChildren])

  if (ctx.isMobile) {
    return <span ref={ref} {...props}>{children || (!ctx.value && placeholder)}</span>
  }

  return <SelectPrimitiveValue placeholder={placeholder} {...props}>{children}</SelectPrimitiveValue>
}

interface SelectContentProps {
  children: React.ReactNode
  label?: string
  className?: string
}

function SelectContent({ children, label, className }: SelectContentProps) {
  const { isMobile } = useSelectContext()

  if (isMobile) {
    return (<>
      <SheetContent side="bottom" forceMount>
        <SheetHeader className="border-b">
          <SheetTitle>{label || "Select an option"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col px-2 mb-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </SheetContent>
      <SheetHiddenContext.Provider value={true}>
        {/* hidden mirror for portals */}
        <div hidden>{children}</div>
      </SheetHiddenContext.Provider>
    </>)
  }

  return <SelectPrimitiveContent className={className}>{children}</SelectPrimitiveContent>
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
}

function SelectItem({ value, children }: SelectItemProps) {
  const isWithinSheetHiddenContext = useSheetHiddenContext()
  const { isMobile, value: selectedValue, setValue } = useSelectContext()

  if (isMobile) {
    return (<>
      <SheetClose asChild>
        <button
          type="button"
          onClick={() => setValue(value)}
          className={cn(
            "w-full px-2 py-2 text-left text-sm rounded-md flex items-center gap-2",
            selectedValue === value && "bg-card text-card-foreground shadow"
          )}
        >
          {selectedValue === value ? <Check className="h-4 w-4 opacity-50" /> : <div className="h-4 w-4 opacity-50" />}
          {children}
        </button>
      </SheetClose>
      {isWithinSheetHiddenContext && <SelectItemPortal value={value}>{children}</SelectItemPortal>}
    </>
    )
  }

  return <SelectPrimitiveItem value={value}>{children}</SelectPrimitiveItem>
}

function SelectItemPortal({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const ctx = useSelectContext();
  const isSelected = ctx.value === value;

  if (!isSelected || !ctx.valueNode || ctx.valueNodeHasChildren) return null;

  return ReactDOM.createPortal(
    <span className="inline pointer-events-none static" aria-hidden>
      {children}
    </span>,
    ctx.valueNode as HTMLElement
  );
}

export {
  Select, SelectContent,
  SelectItem, SelectTrigger,
  SelectValue
}

