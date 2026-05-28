"use client";

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@tomomai/ui";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";

type ButtonVariant =
  | "default"
  | "outline"
  | "destructive"
  | "secondary"
  | "ghost"
  | "link";

export interface DialogAction<T> {
  label: string;
  value: T;
  variant?: ButtonVariant;
}

export interface ShowDialogOptions<T> {
  title: string;
  description?: string;
  actions: DialogAction<T>[];
  /** Value resolved when user dismisses via Esc or outside click. */
  dismissValue: T;
  /** If a dialog with this key is already open, return that promise instead of stacking. */
  dedupKey?: string;
}

const pendingByKey = new Map<string, Promise<unknown>>();

function Host<T>({
  opts,
  finish,
}: {
  opts: ShowDialogOptions<T>;
  finish: (v: T) => void;
}) {
  const [open, setOpen] = useState(true);

  const choose = (v: T) => {
    if (!open) return;
    setOpen(false);
    finish(v);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) choose(opts.dismissValue);
      }}
    >
      <ResponsiveDialogContent className="sm:max-w-[440px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{opts.title}</ResponsiveDialogTitle>
          {opts.description ? (
            <ResponsiveDialogDescription className="whitespace-pre-line">
              {opts.description}
            </ResponsiveDialogDescription>
          ) : null}
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter className="flex-col sm:flex-row gap-2">
          {opts.actions.map((a, i) => (
            <Button
              key={i}
              variant={a.variant ?? "default"}
              onClick={() => choose(a.value)}
              className="w-full sm:w-auto"
            >
              {a.label}
            </Button>
          ))}
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * Imperative modal — JOptionPane-style. Mounts a transient React root on
 * `document.body`, renders a `ResponsiveDialog` with the given actions, and
 * resolves with the value of whichever action the user picked (or
 * `dismissValue` if they Esc/click-outside).
 *
 * Strings come in pre-translated; this helper has no React context.
 */
export function showDialog<T>(opts: ShowDialogOptions<T>): Promise<T> {
  if (typeof document === "undefined") return Promise.resolve(opts.dismissValue);
  if (opts.dedupKey) {
    const existing = pendingByKey.get(opts.dedupKey);
    if (existing) return existing as Promise<T>;
  }

  const p = new Promise<T>((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    const cleanup = (v: T) => {
      setTimeout(() => {
        root.unmount();
        div.remove();
        if (opts.dedupKey) pendingByKey.delete(opts.dedupKey);
        resolve(v);
      }, 200);
    };

    root.render(<Host opts={opts} finish={cleanup} />);
  });

  if (opts.dedupKey) pendingByKey.set(opts.dedupKey, p);
  return p;
}

/** Single-button informational modal. Resolves when dismissed. */
export function showMessage(opts: {
  title: string;
  description?: string;
  label: string;
  dedupKey?: string;
}): Promise<void> {
  return showDialog<void>({
    title: opts.title,
    description: opts.description,
    actions: [{ label: opts.label, value: undefined }],
    dismissValue: undefined,
    dedupKey: opts.dedupKey,
  });
}

/** Confirm/cancel modal. Resolves `true` on confirm, `false` on cancel/dismiss. */
export function showConfirm(opts: {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  dedupKey?: string;
}): Promise<boolean> {
  return showDialog<boolean>({
    title: opts.title,
    description: opts.description,
    actions: [
      { label: opts.cancelLabel, value: false, variant: "outline" },
      {
        label: opts.confirmLabel,
        value: true,
        variant: opts.destructive ? "destructive" : "default",
      },
    ],
    dismissValue: false,
    dedupKey: opts.dedupKey,
  });
}
