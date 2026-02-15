"use client";

import { useState } from "react";
import {
  AnimatedDialog,
  AnimatedDialogContent,
  AnimatedDialogHeader,
  AnimatedDialogTitle,
  AnimatedDialogDescription,
  AnimatedDialogFooter,
} from "@/components/ui/animated-dialog";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Button } from "@/components/ui/button";
import { PolicyDialog } from "@/components/policy-dialog";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";

interface ConsentDialogProps {
  open: boolean;
  tosContent: string;
  privacyContent: string;
  onConsent: () => void;
  onCancel: () => void;
}

/**
 * Consent dialog that shows before OAuth signup.
 * User must agree to both Terms of Service and Privacy Policy to proceed.
 * Cannot be dismissed by clicking outside or pressing ESC.
 */
export function ConsentDialog({
  open,
  tosContent,
  privacyContent,
  onConsent,
  onCancel,
}: ConsentDialogProps) {
  const t = useTranslations("consent");
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showTosDialog, setShowTosDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showTosPreview, setShowTosPreview] = useState(false);
  const [showPrivacyPreview, setShowPrivacyPreview] = useState(false);

  const canProceed = tosChecked && privacyChecked;

  return (
    <>
      <AnimatedDialog open={open} onOpenChange={() => { }}>
        <AnimatedDialogContent
          showCloseButton={false}
          className="max-w-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AnimatedDialogHeader>
            <AnimatedDialogTitle>{t("title")}</AnimatedDialogTitle>
            <AnimatedDialogDescription>
              {t("description")}
            </AnimatedDialogDescription>
          </AnimatedDialogHeader>

          <div className="space-y-4 py-4">
            {/* TL;DR Section */}
            <div className="bg-muted/50 p-4 rounded-md">
              <h3 className="text-sm font-semibold mb-2">{t("tldr.title")}</h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t("tldr.points.0")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t("tldr.points.1")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t("tldr.points.2")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t("tldr.points.3")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span>{t("tldr.points.4")}</span>
                </li>
              </ul>
            </div>
            {/* Terms of Service */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="tos-consent"
                  checked={tosChecked}
                  onCheckedChange={(checked) => setTosChecked(checked === true)}
                />
                <label
                  htmlFor="tos-consent"
                  className="text-sm font-medium cursor-pointer select-none flex-1"
                >
                  {t("agreeToTos")}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTosDialog(true)}
                >
                  {t("viewFullText")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTosPreview(!showTosPreview)}
                >
                  {showTosPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {showTosPreview && (
                <div className="ml-8 p-3 bg-muted rounded-md max-h-50 overflow-y-auto">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-8">
                    {tosContent.substring(0, 1000)}...
                  </p>
                </div>
              )}
            </div>

            {/* Privacy Policy */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="privacy-consent"
                  checked={privacyChecked}
                  onCheckedChange={(checked) => setPrivacyChecked(checked === true)}
                />
                <label
                  htmlFor="privacy-consent"
                  className="text-sm font-medium cursor-pointer select-none flex-1"
                >
                  {t("agreeToPrivacy")}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrivacyDialog(true)}
                >
                  {t("viewFullText")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPrivacyPreview(!showPrivacyPreview)}
                >
                  {showPrivacyPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
              {showPrivacyPreview && (
                <div className="ml-8 p-3 bg-muted rounded-md max-h-32 overflow-y-auto">
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                    {privacyContent.substring(0, 500)}...
                  </p>
                </div>
              )}
            </div>
          </div>

          <AnimatedDialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={onCancel}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={onConsent}
              disabled={!canProceed}
            >
              {t("agree")}
            </Button>
          </AnimatedDialogFooter>
        </AnimatedDialogContent>
      </AnimatedDialog>

      {/* Policy dialogs */}
      <PolicyDialog
        open={showTosDialog}
        onOpenChange={setShowTosDialog}
        title="Terms of Service"
        content={tosContent}
      />
      <PolicyDialog
        open={showPrivacyDialog}
        onOpenChange={setShowPrivacyDialog}
        title="Privacy Policy"
        content={privacyContent}
      />
    </>
  );
}
