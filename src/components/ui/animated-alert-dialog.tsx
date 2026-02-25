"use client"

import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"
import { motion, AnimatePresence } from "motion/react"
import { cn } from "@/lib/utils"
import { getTransition } from "@/lib/animation-constants"
import {
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "./alert-dialog"

const AnimatedAlertDialogContext = React.createContext<{ open: boolean }>({ open: false })

/**
 * AnimatedAlertDialog wraps Radix AlertDialog and shares open state via context
 * so AnimatedAlertDialogContent can drive AnimatePresence.
 */
function AnimatedAlertDialog({
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setUncontrolledOpen(value)
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange]
  )

  return (
    <AnimatedAlertDialogContext.Provider value={{ open }}>
      <AlertDialogPrimitive.Root open={open} onOpenChange={handleOpenChange} {...props}>
        {children}
      </AlertDialogPrimitive.Root>
    </AnimatedAlertDialogContext.Provider>
  )
}

/**
 * Animated Alert Dialog Overlay with fade animation
 */
function AnimatedAlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      forceMount
      asChild
      data-slot="alert-dialog-overlay"
      {...props}
    >
      <motion.div
        className={cn(
          "fixed inset-0 z-50 bg-black/50",
          className
        )}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={getTransition({ duration: 0.2 })}
      />
    </AlertDialogPrimitive.Overlay>
  )
}

/**
 * Animated Alert Dialog Content with spring scale and fade animation
 */
function AnimatedAlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const { open } = React.useContext(AnimatedAlertDialogContext)

  return (
    <AnimatePresence>
      {open && (
        <AlertDialogPortal key="alert-dialog-portal" data-slot="alert-dialog-portal">
          <AnimatedAlertDialogOverlay />
          <AlertDialogPrimitive.Content
            asChild
            data-slot="alert-dialog-content"
            {...props}
          >
            <motion.div
              className={cn(
                "bg-background fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border p-6 shadow-lg sm:max-w-lg",
                className
              )}
              initial={{ opacity: 0, scale: 0.85, y: "-45%", x: "-50%" }}
              animate={{ opacity: 1, scale: 1, y: "-50%", x: "-50%" }}
              exit={{ opacity: 0, scale: 0.9, y: "-48%", x: "-50%" }}
              transition={getTransition({
                type: 'spring',
                stiffness: 400,
                damping: 25
              })}
            >
              {children}
            </motion.div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      )}
    </AnimatePresence>
  )
}

// Re-export non-animated components
export {
  AnimatedAlertDialog,
  AlertDialogTrigger as AnimatedAlertDialogTrigger,
  AnimatedAlertDialogContent,
  AlertDialogHeader as AnimatedAlertDialogHeader,
  AlertDialogFooter as AnimatedAlertDialogFooter,
  AlertDialogTitle as AnimatedAlertDialogTitle,
  AlertDialogDescription as AnimatedAlertDialogDescription,
  AlertDialogAction as AnimatedAlertDialogAction,
  AlertDialogCancel as AnimatedAlertDialogCancel,
}
