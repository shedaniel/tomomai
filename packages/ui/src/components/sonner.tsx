"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

import { useMediaQuery } from "../use-media-query"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // Bottom sheets open from the bottom on phones, so toasts there would cover their buttons.
  const isMobile = useMediaQuery("(max-width: 768px)", { defaultValue: false, initializeWithValue: false })

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={isMobile ? "top-center" : "bottom-right"}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--glass-strong)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-lg)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "glass-strong !gap-3 !px-4 !py-3 !text-sm !shadow-lg",
          description: "!text-muted-foreground",
          error: "[&_[data-icon]]:text-destructive",
          success: "[&_[data-icon]]:text-primary",
          warning: "[&_[data-icon]]:text-amber-500",
          info: "[&_[data-icon]]:text-primary",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
