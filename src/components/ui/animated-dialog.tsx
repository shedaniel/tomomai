"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { motion, AnimatePresence } from "motion/react"
import { XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SPRING_CONFIGS, getTransition } from "@/lib/animation-constants"
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./dialog"

/**
 * Animated Dialog Overlay with fade animation
 */
function AnimatedDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      asChild
      data-slot="dialog-overlay"
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
    </DialogPrimitive.Overlay>
  )
}

/**
 * Animated Dialog Content with spring scale and fade animation
 */
function AnimatedDialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <AnimatedDialogOverlay />
      <DialogPrimitive.Content
        asChild
        data-slot="dialog-content"
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
          {showCloseButton && (
            <DialogPrimitive.Close
              asChild
              data-slot="dialog-close"
            >
              <motion.button
                className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
                whileHover={{ rotate: 90, scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={getTransition({
                  type: 'spring',
                  stiffness: 400,
                  damping: 20
                })}
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </motion.button>
            </DialogPrimitive.Close>
          )}
        </motion.div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

// Re-export non-animated components
export {
  Dialog as AnimatedDialog,
  DialogTrigger as AnimatedDialogTrigger,
  AnimatedDialogContent,
  DialogClose as AnimatedDialogClose,
  DialogHeader as AnimatedDialogHeader,
  DialogFooter as AnimatedDialogFooter,
  DialogTitle as AnimatedDialogTitle,
  DialogDescription as AnimatedDialogDescription,
}
