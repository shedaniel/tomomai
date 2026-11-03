"use client"

import * as React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { useMediaQuery } from "../use-media-query"
import { cn } from "../utils"

interface TooltipFriendlyContextValue {
  isTouch: boolean
}

const TooltipFriendlyContext = React.createContext<TooltipFriendlyContextValue>({ isTouch: false })

function useTooltipFriendly() {
  return React.useContext(TooltipFriendlyContext)
}

// --- Root ---
// Switches on hover capability rather than width, since a touch-only tablet can't open a tooltip.
interface TooltipFriendlyProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  delayDuration?: number
  children: React.ReactNode
}

function TooltipFriendly({ open, onOpenChange, delayDuration = 100, children }: TooltipFriendlyProps) {
  const canHover = useMediaQuery("(hover: hover) and (pointer: fine)", {
    defaultValue: true,
    initializeWithValue: false,
  })
  const isTouch = !canHover

  return (
    <TooltipFriendlyContext.Provider value={{ isTouch }}>
      {isTouch ? (
        <Drawer open={open} onOpenChange={onOpenChange}>{children}</Drawer>
      ) : (
        <TooltipProvider delayDuration={delayDuration}>
          <Tooltip open={open} onOpenChange={onOpenChange}>{children}</Tooltip>
        </TooltipProvider>
      )}
    </TooltipFriendlyContext.Provider>
  )
}

// --- Trigger ---
function TooltipFriendlyTrigger({ onClick, ...props }: React.ComponentProps<typeof TooltipTrigger>) {
  const { isTouch } = useTooltipFriendly()
  if (isTouch) {
    // Opening the sheet is the tap's action, so it shouldn't also activate a surrounding control
    return (
      <DrawerTrigger
        {...props}
        onClick={(event) => {
          event.stopPropagation()
          onClick?.(event)
        }}
      />
    )
  }
  return <TooltipTrigger onClick={onClick} {...props} />
}

// --- Content ---
interface TooltipFriendlyContentProps extends Omit<React.ComponentProps<typeof TooltipContent>, "title"> {
  /** Heading shown at the top of the tooltip, and as the sheet title on touch devices. */
  title?: React.ReactNode
  /** Screen-reader description for the sheet on touch devices. */
  description?: React.ReactNode
}

function TooltipFriendlyContent({ title, description, className, children, ...props }: TooltipFriendlyContentProps) {
  const { isTouch } = useTooltipFriendly()

  if (isTouch) {
    return (
      <DrawerContent>
        <DrawerHeader className={cn("text-left", !title && "sr-only")}>
          <DrawerTitle className="text-left">{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{description}</DrawerDescription>
        </DrawerHeader>
        <div className={cn("px-4 pb-8", className)}>{children}</div>
      </DrawerContent>
    )
  }

  return (
    <TooltipContent className={className} {...props}>
      {title && <div className="mb-1.5 text-xs font-semibold">{title}</div>}
      {children}
    </TooltipContent>
  )
}

export {
  TooltipFriendly,
  TooltipFriendlyTrigger,
  TooltipFriendlyContent,
  useTooltipFriendly,
}
