"use client";

import {
  AnimatedDialog,
  AnimatedDialogContent,
  AnimatedDialogHeader,
  AnimatedDialogTitle,
} from "@/components/ui/animated-dialog";

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
    <AnimatedDialog open={open} onOpenChange={onOpenChange}>
      <AnimatedDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <AnimatedDialogHeader>
          <AnimatedDialogTitle>{title}</AnimatedDialogTitle>
        </AnimatedDialogHeader>
        <div className="flex-1 overflow-y-auto pr-2">
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {content}
          </div>
        </div>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
