import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { motion, HTMLMotionProps } from "motion/react"
import { cn } from "@/lib/utils"
import { SPRING_CONFIGS, getTransition } from "@/lib/animation-constants"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "border bg-card shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

/**
 * Animated Button with Framer Motion hover and tap effects
 */
const MotionButton = React.forwardRef<
  HTMLButtonElement,
  Omit<HTMLMotionProps<"button">, "ref"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }
>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      whileHover = { scale: 1.02, y: -1 },
      whileTap = { scale: 0.98 },
      transition = getTransition(SPRING_CONFIGS.snappy),
      ...props
    },
    ref
  ) => {
    // If asChild is true, we can't use motion directly
    if (asChild) {
      const { children: motionChildren, ...restProps } = props as any
      return (
        <Slot
          data-slot="button"
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          {...restProps}
        >
          {motionChildren}
        </Slot>
      )
    }

    return (
      <motion.button
        data-slot="button"
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        whileHover={whileHover}
        whileTap={whileTap}
        transition={transition}
        {...props}
      />
    )
  }
)

MotionButton.displayName = "MotionButton"

export { Button, MotionButton, buttonVariants }
