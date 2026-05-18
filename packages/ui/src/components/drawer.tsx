"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"

import { cn } from "../utils"
import { triggerHaptic } from "../haptics"

function Drawer({
  onOpenChange,
  onClose,
  onRelease,
  setActiveSnapPoint,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      triggerHaptic(open ? "medium" : "light")
      onOpenChange?.(open)
    },
    [onOpenChange]
  )
  const handleClose = React.useCallback(() => {
    triggerHaptic("light")
    onClose?.()
  }, [onClose])
  const handleRelease = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>, open: boolean) => {
      if (!open) triggerHaptic("light")
      onRelease?.(e, open)
    },
    [onRelease]
  )
  const handleSetActiveSnapPoint = React.useCallback(
    (snapPoint: number | string | null) => {
      triggerHaptic("selection")
      setActiveSnapPoint?.(snapPoint)
    },
    [setActiveSnapPoint]
  )
  return (
    <DrawerPrimitive.Root
      data-slot="drawer"
      onOpenChange={handleOpenChange}
      onClose={handleClose}
      onRelease={handleRelease}
      setActiveSnapPoint={handleSetActiveSnapPoint}
      {...props}
    />
  )
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  inline,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & { inline?: boolean }) {
  // When `inline` is set, the drawer content renders in JSX flow rather than
  // through a portal-to-body. Use this when the parent is already mounted at
  // a body-equivalent location (e.g. directly in a top-level layout) so the
  // content can participate in SSR HTML. Skipping the portal also means the
  // drawer is visible to crawlers and JS-off clients out of the box.
  const drawerContent = (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn(
        "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
        "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
        "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
        "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-lg data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
        "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-lg data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
        className
      )}
      {...props}
    >
      {/*
       * Visual drag-handle bar. Positioned absolutely so it sits on top
       * of any sibling content (which can use negative margins to overlap
       * the drawer's top region) — without absolute positioning, the
       * later siblings paint over the handle and intercept pointer events,
       * leaving the visible handle visually present but unclickable.
       * z-10 keeps it above content but well under the drawer's own
       * z-50 layer; pointer events still bubble to vaul's onPointerDown
       * on the drawer for drag.
       */}
      <div className="bg-muted absolute left-1/2 -translate-x-1/2 top-2 z-10 hidden h-2 w-[100px] rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
      {children}
    </DrawerPrimitive.Content>
  )
  if (inline) {
    return (
      <>
        <DrawerOverlay />
        {drawerContent}
      </>
    )
  }
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      {drawerContent}
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        className
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
