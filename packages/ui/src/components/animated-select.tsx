"use client"

import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { motion } from "motion/react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "../utils"
import { getTransition } from "../animation-constants"

interface AnimatedSelectContextValue {
  /** True when the user intends the select to be open */
  open: boolean
  /** Called when exit animation finishes so we can unmount */
  onExitComplete: () => void
}

const AnimatedSelectContext = React.createContext<AnimatedSelectContextValue>({
  open: false,
  onExitComplete: () => { },
})

/**
 * AnimatedSelect wraps Radix Select. It keeps the content mounted during
 * exit animations by delaying the Radix `open` prop.
 */
function AnimatedSelect({
  open: controlledOpen,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen

  // `mounted` stays true during exit animation so Radix keeps content in DOM
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  const onExitComplete = React.useCallback(() => {
    setMounted(false)
  }, [])

  const handleOpenChange = React.useCallback(
    (value: boolean) => {
      if (!isControlled) setUncontrolledOpen(value)
      onOpenChange?.(value)
    },
    [isControlled, onOpenChange]
  )

  return (
    <AnimatedSelectContext.Provider value={{ open, onExitComplete }}>
      <SelectPrimitive.Root open={mounted} onOpenChange={handleOpenChange} {...props}>
        {children}
      </SelectPrimitive.Root>
    </AnimatedSelectContext.Provider>
  )
}

/**
 * Animated Select Content with spring scale-from-origin enter
 * and spring fade/scale exit.
 */
function AnimatedSelectContent({
  className,
  children,
  position = "popper",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  const { open, onExitComplete } = React.useContext(AnimatedSelectContext)

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        asChild
        position={position}
        {...props}
      >
        <motion.div
          className={cn(
            "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md",
            // transform-origin based on which side content appears
            "data-[side=bottom]:origin-top data-[side=top]:origin-bottom data-[side=left]:origin-right data-[side=right]:origin-left",
            position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className
          )}
          initial={{ opacity: 0, scale: 0.92 }}
          animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }}
          onAnimationComplete={() => {
            if (!open) onExitComplete()
          }}
          transition={getTransition({
            type: "spring",
            stiffness: 500,
            damping: 28,
          })}
        >
          <SelectPrimitive.ScrollUpButton className="flex cursor-default items-center justify-center py-1">
            <ChevronUp className="h-4 w-4" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
            )}
          >
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="flex cursor-default items-center justify-center py-1">
            <ChevronDown className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </motion.div>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

const AnimatedSelectTrigger = SelectPrimitive.Trigger
const AnimatedSelectValue = SelectPrimitive.Value
const AnimatedSelectItem = SelectPrimitive.Item
const AnimatedSelectGroup = SelectPrimitive.Group
const AnimatedSelectLabel = SelectPrimitive.Label
const AnimatedSelectSeparator = SelectPrimitive.Separator
const AnimatedSelectItemText = SelectPrimitive.ItemText
const AnimatedSelectItemIndicator = SelectPrimitive.ItemIndicator

export {
  AnimatedSelect,
  AnimatedSelectContent,
  AnimatedSelectTrigger,
  AnimatedSelectValue,
  AnimatedSelectItem,
  AnimatedSelectGroup,
  AnimatedSelectLabel,
  AnimatedSelectSeparator,
  AnimatedSelectItemText,
  AnimatedSelectItemIndicator,
}
