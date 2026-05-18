"use client"

import * as React from "react"
import {
  AnimatedDialog,
  AnimatedDialogContent,
} from "./animated-dialog"
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer"
import { useMediaQuery } from "../use-media-query"
import { cn } from "../utils"

interface DialogFriendlyContextValue {
  isMobile: boolean
}

const DialogFriendlyContext = React.createContext<DialogFriendlyContextValue>({ isMobile: false })

function useDialogFriendly() {
  return React.useContext(DialogFriendlyContext)
}

// --- Root ---
interface ResponsiveDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  dismissible?: boolean
  modal?: boolean
}

function ResponsiveDialog({ open, onOpenChange, dismissible = true, modal, children }: ResponsiveDialogProps) {
  const isMobile = useMediaQuery("(max-width: 768px)", {
    defaultValue: false,
    initializeWithValue: false,
  })

  return (
    <DialogFriendlyContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissible} modal={modal}>{children}</Drawer>
      ) : (
        <AnimatedDialog open={open} onOpenChange={onOpenChange} modal={modal}>{children}</AnimatedDialog>
      )}
    </DialogFriendlyContext.Provider>
  )
}

// --- Trigger ---
function ResponsiveDialogTrigger({ ...props }: React.ComponentProps<typeof DialogTrigger>) {
  const { isMobile } = useDialogFriendly()
  return isMobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />
}

// --- Close ---
function ResponsiveDialogClose({ ...props }: React.ComponentProps<typeof DialogClose>) {
  const { isMobile } = useDialogFriendly()
  return isMobile ? <DrawerClose {...props} /> : <DialogClose {...props} />
}

// --- Content ---
function ResponsiveDialogContent({
  className,
  children,
  showCloseButton,
  ...props
}: React.ComponentProps<typeof AnimatedDialogContent>) {
  const { isMobile } = useDialogFriendly()

  if (isMobile) {
    return (
      <DrawerContent>
        <div className={cn("px-4 pb-8 overflow-y-auto max-h-[80dvh] grid w-full gap-4", className)}>
          {children}
        </div>
      </DrawerContent>
    )
  }

  return (
    <AnimatedDialogContent className={cn("overflow-y-auto max-h-[95dvh]", className)} showCloseButton={showCloseButton} {...props}>
      {children}
    </AnimatedDialogContent>
  )
}

// --- Header ---
function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = useDialogFriendly()

  if (isMobile) {
    return <DrawerHeader className={cn("px-0 gap-1.5 pb-0", className)} {...props} />
  }

  return <DialogHeader className={className} {...props} />
}

// --- Footer ---
function ResponsiveDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = useDialogFriendly()

  if (isMobile) {
    return <DrawerFooter className={cn("px-0 pt-4 pb-2", className)} {...props} />
  }

  return <DialogFooter className={className} {...props} />
}

// --- Title ---
function ResponsiveDialogTitle({ className, ...props }: React.ComponentProps<typeof DialogTitle>) {
  const { isMobile } = useDialogFriendly()
  return isMobile ? <DrawerTitle className={cn("text-lg text-left", className)} {...props} /> : <DialogTitle className={className} {...props} />
}

// --- Description ---
function ResponsiveDialogDescription({ className, ...props }: React.ComponentProps<typeof DialogDescription>) {
  const { isMobile } = useDialogFriendly()
  return isMobile ? <DrawerDescription className={cn("text-left", className)} {...props} /> : <DialogDescription className={className} {...props} />
}

export {
  ResponsiveDialog,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
}
