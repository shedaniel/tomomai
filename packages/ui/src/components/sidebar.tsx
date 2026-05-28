"use client"

import * as React from "react"
import { cn } from "../utils"
import { triggerHaptic } from "../haptics"

interface SidebarContextValue {
  value: string | undefined
  onValueChange: ((value: string) => void) | undefined
}

const SidebarContext = React.createContext<SidebarContextValue>({
  value: undefined,
  onValueChange: undefined,
})

interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  value?: string
  onValueChange?: (value: string) => void
}

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ className, value, onValueChange, children, ...props }, ref) => (
    <SidebarContext.Provider value={{ value, onValueChange }}>
      <nav
        ref={ref}
        className={cn(
          "flex sm:flex-col flex-row gap-x-1 sm:w-48 w-full shrink-0 overflow-x-auto",
          className
        )}
        {...props}
      >
        {children}
      </nav>
    </SidebarContext.Provider>
  )
)
Sidebar.displayName = "Sidebar"

interface SidebarItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
  icon?: React.ElementType
  text?: React.ReactNode
  matchPrefix?: boolean
}

const SidebarItem = React.forwardRef<HTMLButtonElement, SidebarItemProps>(
  ({ className, value, icon: Icon, text, matchPrefix = false, onClick, children, ...props }, ref) => {
    const ctx = React.useContext(SidebarContext)
    const isActive =
      ctx.value === value ||
      (matchPrefix && !!ctx.value?.startsWith(value + "/"))

    return (
      <button
        ref={ref}
        data-state={isActive ? "active" : "inactive"}
        className={cn(
          "flex items-center justify-start rounded-md text-sm transition-all whitespace-nowrap shrink-0 md:shrink md:whitespace-normal px-3 py-2 text-muted-foreground",
          isActive
            ? "bg-muted text-foreground font-medium border border-border shadow-none md:px-3.5 md:my-1 md:text-[15px] max-md:px-4"
            : "hover:text-foreground hover:bg-muted/50",
          className
        )}
        onClick={(e) => {
          triggerHaptic("selection")
          ctx.onValueChange?.(value)
          onClick?.(e)
        }}
        {...props}
      >
        {Icon && (
          <Icon
            className={cn(
              "size-4 me-2 transition-all",
              isActive && "scale-125"
            )}
          />
        )}
        {text ?? children}
      </button>
    )
  }
)
SidebarItem.displayName = "SidebarItem"

export { Sidebar, SidebarItem }
export type { SidebarProps, SidebarItemProps }
