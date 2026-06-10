"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { Button } from "@tomomai/ui";
import { PolicyDialog } from "@/components/policy-dialog";
import { ChevronDown, ChevronUp, Dot, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "./providers/locale-provider";
import { isCNExclusive, isRegionEnabled } from "@tomomai/catalog/enabled-regions";
import { DiscordIcon, XIcon } from "@tomomai/ui";

interface ConsentDialogProps {
  open: boolean;
  tosContent: string;
  privacyContent: string;
  onConsent: (method: "discord" | "twitter") => Promise<void>;
  onCancel: () => void;
  signupEnabled?: boolean;
  twitterOauthEnabled?: boolean;
}

export function ConsentDialog({
  open,
  tosContent,
  privacyContent,
  onConsent,
  onCancel,
  signupEnabled = true,
  twitterOauthEnabled = false,
}: ConsentDialogProps) {
  const { locale } = useLocale();
  const t = useTranslations("consent");
  const ta = useTranslations("auth");
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [showTosDialog, setShowTosDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showTosPreview, setShowTosPreview] = useState(false);
  const [showPrivacyPreview, setShowPrivacyPreview] = useState(false);
  const [proceeding, setProceeding] = useState<"discord" | "twitter" | null>(null);

  useEffect(() => {
    if (!open) setProceeding(null);
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
              <div className="w-full flex flex-col gap-2">
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
                {twitterOauthEnabled && (
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
                )}
              </div>
            )}

            <Button
              variant="ghost"
              onClick={onCancel}
              disabled={proceeding !== null}
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
