"use client";

import {
  Button,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useState, type ReactNode } from "react";

interface WizardDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  icon: LucideIcon;
  /** Zero-based index of the step shown. */
  step: number;
  stepKey: string;
  direction: 1 | -1;
  title: string;
  description: string;
  children: ReactNode;
  onPrevious: () => void;
  previousDisabled?: boolean;
  /** The forward button, which the last step usually swaps for its own action. */
  next: ReactNode;
  /** Room for a walkthrough recording. */
  wide?: boolean;
}

export function WizardDialog({ isOpen, onOpenChange, icon: Icon, step, stepKey, direction, title, description, children, onPrevious, previousDisabled, next, wide }: WizardDialogProps) {
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  // Follows the step on screen as it grows, such as a list that changes with a select. A step that
  // left the page measures 0, which would collapse the dialog when it opens again.
  useLayoutEffect(() => {
    if (!content) return;
    const measure = () => { if (content.isConnected) setHeight(content.offsetHeight); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [content]);

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className={cn("shadow transition-[max-width] duration-300", wide ? "sm:max-w-xl" : "sm:max-w-md")}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center space-x-2">
            <Icon className="h-5 w-5 flex-shrink-0" />
            <div className="flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-full bg-primary text-primary-foreground text-md font-bold">
              {step + 1}
            </div>
            <span className="font-medium text-foreground tracking-tight">{title}</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{description}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <motion.div
          initial={false}
          className="relative -m-1 overflow-hidden"
          animate={{ height: height ?? "auto" }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              key={stepKey}
              // The exiting step unmounts after the entering one mounts, so its null must not win.
              ref={(node: HTMLDivElement | null) => { if (node) setContent(node); }}
              initial={{ opacity: 0, x: 60 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -60 * direction, position: "absolute", top: 0, left: 0, right: 0 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              // Inset so focus rings and borders at the edges survive the clipping.
              className="space-y-3 p-1"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <WizardFooter onPrevious={onPrevious} previousDisabled={previousDisabled} next={next} />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function WizardFooter({ onPrevious, previousDisabled, next }: Pick<WizardDialogProps, "onPrevious" | "previousDisabled" | "next">) {
  const t = useTranslations();
  return (
    <ResponsiveDialogFooter className="flex-row justify-between gap-3 sm:justify-between">
      <Button variant="outline" onClick={onPrevious} disabled={previousDisabled}>
        {t("tokenDialog.wizard.previousStep")}
      </Button>
      {next}
    </ResponsiveDialogFooter>
  );
}

/** The usual forward button. */
export function WizardNextButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const t = useTranslations();
  return <Button onClick={onClick} disabled={disabled}>{t("tokenDialog.wizard.nextStep")}</Button>;
}

/**
 * Wizard step state that starts over each time the dialog opens, at the step `onReset` names or the first.
 * It follows the step by name, so a flow that drops or adds steps on the way keeps the step on screen.
 */
export function useWizardSteps<K extends string>(steps: readonly K[], isOpen: boolean, onReset?: () => K | void) {
  const [key, setKey] = useState<K>(steps[0]);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setKey(onReset?.() || steps[0]);
      setDirection(1);
    }
  }
  const index = Math.max(0, steps.indexOf(key));
  const goTo = (next: number) => {
    setDirection(next > index ? 1 : -1);
    setKey(steps[next]);
  };
  return { index, key: steps[index], direction, goTo, isFirst: index === 0, isLast: index === steps.length - 1 };
}
