"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/dialog-friendly";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Button } from "@/components/ui/button";
import { PolicyDialog } from "@/components/policy-dialog";
import { ChevronDown, ChevronUp, Dot, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "./providers/locale-provider";
import { isCNExclusive, isRegionEnabled } from "@/lib/enabled-regions";
import { DiscordIcon } from "@/components/ui/discord-icon";
import { XIcon } from "@/components/ui/x-icon";
import { AltchaWidget } from "@/components/ui/altcha-widget";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

interface ConsentDialogProps {
  open: boolean;
  tosContent: string;
  privacyContent: string;
  onConsent: (method: "discord" | "twitter" | "passkey") => Promise<void>;
  onCancel: () => void;
  signupEnabled?: boolean;
}

export function ConsentDialog({
  open,
  tosContent,
  privacyContent,
  onConsent,
  onCancel,
  signupEnabled = true,
}: ConsentDialogProps) {
  const { locale } = useLocale();
  const t = useTranslations("consent");
  const tp = useTranslations("passkeys");
  const ta = useTranslations("auth");
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showTosDialog, setShowTosDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showTosPreview, setShowTosPreview] = useState(false);
  const [showPrivacyPreview, setShowPrivacyPreview] = useState(false);

  // Passkey flow state
  const [passkeyStage, setPasskeyStage] = useState<"idle" | "captcha" | "verifying" | "registering">("idle");
  const [proceeding, setProceeding] = useState<"discord" | "twitter" | null>(null);

  useEffect(() => {
    if (!open) {
      setPasskeyStage("idle");
      setProceeding(null);
    }
  }, [open]);

  const canProceed = tosChecked && privacyChecked && signupEnabled;

  const handleSocialMethod = async (method: "discord" | "twitter") => {
    setProceeding(method);
    try {
      await onConsent(method);
    } finally {
      setProceeding(null);
    }
  };

  const handlePasskeyClick = () => {
    setPasskeyStage("captcha");
  };

  const handleAltchaSolve = async (payload: string) => {
    setPasskeyStage("registering");
    try {
      const result = await authClient.signIn.passkey({
        fetchOptions: { headers: { "x-captcha-response": payload } },
      });
      if (result?.error) {
        toast.error(tp("addError"));
        setPasskeyStage("idle");
        return;
      }
      await onConsent("passkey");
    } catch (err) {
      console.error("Passkey sign-in error:", err);
      toast.error(tp("addError"));
      setPasskeyStage("idle");
    }
  };

  const handleAltchaError = () => {
    toast.error(tp("captchaFailed"));
    setPasskeyStage("idle");
  };

  const handleCancel = () => {
    setPasskeyStage("idle");
    setProceeding(null);
    onCancel();
  };

  const cnMode = isCNExclusive();

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={() => { }} dismissible={false}>
        <ResponsiveDialogContent
          showCloseButton={false}
          className="max-w-2xl max-h-[90dvh]"
          style={{ backgroundImage: "linear-gradient(160deg, color-mix(in srgb, var(--primary) 10%, transparent), transparent 22%)" }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t("title")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t("description")}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4 py-4">
            {/* TL;DR Section */}
            <div className="bg-primary/[0.03] border border-border p-4 rounded-xl">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest mb-3 text-primary/60">{t("tldr.title")}</h3>
              <ul className="space-y-2 text-xs text-foreground/65">
                <li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>{t("tldr.points.0")}</span>
                </li>
                <li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>{!cnMode ? t("tldr.points.1") : "你的数据将安全存储在中国大陆境内的服务器上"}</span>
                </li>
                {!cnMode && (<li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>{t("tldr.points.2")}</span>
                </li>)}
                <li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>{t("tldr.points.3")}</span>
                </li>
                <li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>{!cnMode ? t("tldr.points.4") : "我们是独立工具，与 SEGA 或 华立科技 没有任何关联"}</span>
                </li>
                {locale === "zh-CN" && (<li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  {cnMode ? (
                    <span>支持华立科技舞萌之覆盖地区<br />原则上仅限中国大陆地区访问</span>
                  ) : isRegionEnabled("cn") ? (
                    <span>支持 maimai 日本版及国际版、以及华立科技舞萌之覆盖地区<br /><span className="underline">本站为境外站点，中国大陆地区访问速度可能较慢且不稳定</span>，境内版 tomomai.cn 正在建设中</span>
                  ) : (
                    <span>支持 maimai 日本版及国际版覆盖地区<br />原则上暂不支持中国大陆地区访问</span>
                  )}
                </li>)}
                {cnMode && (<li className="flex items-start gap-1">
                  <Dot className="text-primary shrink-0" size={16} strokeWidth={3} fill="true" />
                  <span>国内版 tomomai (同萌) 目前处于内测阶段，部分功能可能与国际版存在差异</span>
                </li>)}
              </ul>
            </div>

            {/* Consent checkboxes */}
            <div className="space-y-2">
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    id="tos-consent"
                    checked={tosChecked}
                    onCheckedChange={(checked) => setTosChecked(checked === true)}
                  />
                  <label
                    htmlFor="tos-consent"
                    className="text-sm font-semibold cursor-pointer select-none flex-1"
                  >
                    {t("agreeToTos")}
                  </label>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowTosDialog(true)}>
                    {t("viewFullText")}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTosPreview(!showTosPreview)}>
                    {showTosPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
                {showTosPreview && (
                  <div className="px-3 pb-3">
                    <div className="p-3 bg-muted/60 rounded-md max-h-50 overflow-y-auto">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-8">
                        {tosContent.substring(0, 1000)}...
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    id="privacy-consent"
                    checked={privacyChecked}
                    onCheckedChange={(checked) => setPrivacyChecked(checked === true)}
                  />
                  <label
                    htmlFor="privacy-consent"
                    className="text-sm font-semibold cursor-pointer select-none flex-1"
                  >
                    {t("agreeToPrivacy")}
                  </label>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowPrivacyDialog(true)}>
                    {t("viewFullText")}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPrivacyPreview(!showPrivacyPreview)}>
                    {showPrivacyPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
                {showPrivacyPreview && (
                  <div className="px-3 pb-3">
                    <div className="p-3 bg-muted/60 rounded-md max-h-32 overflow-y-auto">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
                        {privacyContent.substring(0, 500)}...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {cnMode && (
              <div className="text-2xs mt-2">
                国内版虽然也叫 tomomai，但你可以叫它「同萌」——取其「同我萌 (to-mo-mai)」之意
              </div>
            )}
          </div>

          <ResponsiveDialogFooter className="flex-col gap-3 sm:flex-col">
            {/* Agree separator — always visible */}
            <div className="relative w-full flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-foreground/40 shrink-0">{t("agree")}</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {cnMode ? (
              <Button
                onClick={() => handleSocialMethod("discord")}
                disabled={!canProceed || proceeding !== null}
                className="w-full"
                size="lg"
              >
                {proceeding === "discord" ? (
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                ) : (
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
                  </svg>
                )}
                以 QQ 注册
              </Button>
            ) : (
              /* Buttons + captcha share the same space */
              <div className="relative w-full flex flex-col gap-2">
                <motion.div
                  animate={passkeyStage === "idle"
                    ? { opacity: 1, filter: "blur(0px)", scale: 1 }
                    : { opacity: 0, filter: "blur(6px)", scale: 0.97 }}
                  transition={{ duration: 0.18, ease: "easeInOut" }}
                  className="flex flex-col gap-2 w-full"
                  style={{ pointerEvents: passkeyStage === "idle" ? "auto" : "none" }}
                >
                  <Button
                    onClick={() => handleSocialMethod("discord")}
                    disabled={!canProceed || proceeding !== null}
                    size="lg"
                    className="w-full justify-start bg-indigo-500/90 hover:bg-indigo-500 text-white border border-input dark:bg-indigo-500/80 dark:hover:bg-indigo-500 font-semibold"
                  >
                    {proceeding === "discord" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin shrink-0" />
                    ) : (
                      <DiscordIcon className="w-5 h-5 mr-3 shrink-0" />
                    )}
                    {ta("signupWithDiscord")}
                  </Button>
                  <Button
                    onClick={() => handleSocialMethod("twitter")}
                    disabled={!canProceed || proceeding !== null}
                    size="lg"
                    className="w-full justify-start bg-neutral-900 hover:bg-neutral-800 text-white border border-input font-semibold"
                  >
                    {proceeding === "twitter" ? (
                      <Loader2 className="w-5 h-5 mr-3 animate-spin shrink-0" />
                    ) : (
                      <XIcon className="w-5 h-5 mr-3 shrink-0" />
                    )}
                    {ta("signupWithX")}
                  </Button>
                  <Button
                    onClick={handlePasskeyClick}
                    disabled={!canProceed || proceeding !== null}
                    size="lg"
                    variant="outline"
                    className="w-full justify-start font-semibold"
                  >
                    <KeyRound className="w-5 h-5 mr-3 shrink-0" />
                    {ta("signupWithPasskey")}
                  </Button>
                </motion.div>

                <AnimatePresence>
                  {passkeyStage !== "idle" && (
                    <motion.div
                      key="passkey-overlay"
                      initial={{ opacity: 0, filter: "blur(8px)", scale: 1.03, y: 4 }}
                      animate={{ opacity: 1, filter: "blur(0px)", scale: 1, y: 0 }}
                      exit={{ opacity: 0, filter: "blur(8px)", scale: 1.03, y: 4 }}
                      transition={{ duration: 0.22, delay: 0.16, ease: "easeOut" }}
                      className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                    >
                      {passkeyStage === "captcha" && (
                        <AltchaWidget onSolve={handleAltchaSolve} onError={handleAltchaError} className="w-full" />
                      )}
                      {(passkeyStage === "verifying" || passkeyStage === "registering") && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">
                            {passkeyStage === "verifying" ? tp("verifyingCaptcha") : tp("addingPasskey")}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <Button
              variant="ghost"
              onClick={passkeyStage === "idle" ? handleCancel : () => setPasskeyStage("idle")}
              disabled={passkeyStage === "verifying" || passkeyStage === "registering"}
              className="w-full text-muted-foreground hover:text-foreground"
            >
              {t("cancel")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

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
