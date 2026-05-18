"use client";

import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";

interface PolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
}

/**
 * Reusable dialog for displaying policy text (Terms of Service or Privacy Policy).
 * Used by both ConsentDialog and AboutDialog.
 */
export function PolicyDialog({ open, onOpenChange, title, content }: PolicyDialogProps) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {content}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
