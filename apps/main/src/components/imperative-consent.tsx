"use client";

import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  cn,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ScrollArea,
} from "@tomomai/ui";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AutoHeight } from "./animate-ui/primitives/effects/auto-height";

export interface ShowPolicyConsentOptions {
  title: string;
  description: string;
  tosContent: string;
  privacyContent: string;
  agreeTosLabel: string;
  agreePrivacyLabel: string;
  viewFullTextLabel: string;
  confirmLabel: string;
  cancelLabel: string;
}

const pendingByKey = new Map<string, Promise<boolean>>();
const DEDUP_KEY = "policy-consent";

function PolicyRow({
  id,
  label,
  content,
  checked,
  onChecked,
  viewFullTextLabel,
}: {
  id: string;
  label: string;
  content: string;
  checked: boolean;
  onChecked: (v: boolean) => void;
  viewFullTextLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChecked(c === true)} />
        <label htmlFor={id} className="text-sm font-semibold cursor-pointer select-none flex-1">
          {label}
        </label>
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setExpanded(!expanded)}>
          {viewFullTextLabel}
          {expanded ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />}
        </Button>
      </div>
      <AutoHeight className={cn("px-3", expanded && "pb-3")} deps={[expanded]} >
        <ScrollArea className={cn("bg-muted/60 rounded-md w-full h-60", !expanded && "h-0")}>
          <p className="p-3 text-xs text-muted-foreground whitespace-pre-wrap">{content}</p>
        </ScrollArea>
      </AutoHeight>
    </div>
  );
}

function Host({
  opts,
  finish,
}: {
  opts: ShowPolicyConsentOptions;
  finish: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const close = (v: boolean) => {
    if (!open) return;
    setOpen(false);
    finish(v);
  };

  const canConfirm = tosChecked && privacyChecked;

  return (
    <ResponsiveDialog
      open={open}
      dismissible={false}
      onOpenChange={() => { }}
    >
      <ResponsiveDialogContent
        showCloseButton={false}
        className="max-w-2xl max-h-[90dvh]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{opts.title}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{opts.description}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-2 py-2">
          <PolicyRow
            id="reconsent-tos"
            label={opts.agreeTosLabel}
            content={opts.tosContent}
            checked={tosChecked}
            onChecked={setTosChecked}
            viewFullTextLabel={opts.viewFullTextLabel}
          />
          <PolicyRow
            id="reconsent-privacy"
            label={opts.agreePrivacyLabel}
            content={opts.privacyContent}
            checked={privacyChecked}
            onChecked={setPrivacyChecked}
            viewFullTextLabel={opts.viewFullTextLabel}
          />
        </div>

        <ResponsiveDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={() => {
              setConfirming(true);
              close(true);
            }}
            disabled={!canConfirm || confirming}
            size="lg"
            className="w-full"
          >
            {confirming ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
            {opts.confirmLabel}
          </Button>
          <Button
            variant="ghost"
            onClick={() => close(false)}
            disabled={confirming}
            className="w-full text-muted-foreground hover:text-foreground"
          >
            {opts.cancelLabel}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

/**
 * Imperative re-consent modal, mounted on a transient React root (no tRPC / i18n
 * context — strings come pre-translated). Resolves `true` only when the user
 * checks both boxes and confirms; `false` on cancel. Recording the acceptance is
 * the caller's job (it has tRPC context), exactly like reauthGuard keeps the
 * OAuth bounce in the context-aware hook.
 */
export function showPolicyConsent(opts: ShowPolicyConsentOptions): Promise<boolean> {
  if (typeof document === "undefined") return Promise.resolve(false);
  const existing = pendingByKey.get(DEDUP_KEY);
  if (existing) return existing;

  const p = new Promise<boolean>((resolve) => {
    const div = document.createElement("div");
    document.body.appendChild(div);
    const root = createRoot(div);

    const cleanup = (v: boolean) => {
      setTimeout(() => {
        root.unmount();
        div.remove();
        pendingByKey.delete(DEDUP_KEY);
        resolve(v);
      }, 200);
    };

    root.render(<Host opts={opts} finish={cleanup} />);
  });

  pendingByKey.set(DEDUP_KEY, p);
  return p;
}
