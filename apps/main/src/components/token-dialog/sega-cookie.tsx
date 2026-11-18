"use client";

import { GuidePlayer } from "@/components/guide-player";
import { useGame } from "@/components/providers/game-provider";
import type { Region } from "@/lib/games/ids";
import { SEGA_AIME_GATEWAY, siteRoot } from "@/lib/games/sites";
import { formatSegaCookie } from "@/lib/games/token-format";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";
import {
  Button,
  Input,
  Label,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@tomomai/ui";
import { ClipboardPaste, Cookie, Copy, Monitor, Save, Smartphone, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { BROWSER_ICONS } from "./browser-icons";
import { DEVTOOLS_GUIDES, GATEWAY_NOT_FOUND, type DevtoolsFamily } from "./devtools-guides";
import { MethodCard } from "./method-card";
import { BROWSERS, detectBrowser } from "./userscript-managers";
import { WizardDialog, WizardNextButton, useWizardSteps } from "./wizard-dialog";

interface SegaCookieDialogProps {
  region: Region;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

const CLAL_PATTERN = /^(?:clal=)?[A-Za-z0-9]{64}$/;

/** Browsers whose DevTools differ, and so get their own instructions. */
type DevtoolsBrowser = DevtoolsFamily;

const DEVTOOLS_BROWSERS = [
  { id: "chromium", Icon: BROWSER_ICONS.chrome },
  { id: "firefox", Icon: BROWSER_ICONS.firefox },
  { id: "safari", Icon: BROWSER_ICONS.safari },
] as const satisfies readonly { id: DevtoolsBrowser; Icon: unknown }[];

function detectDevtoolsBrowser(): DevtoolsBrowser {
  if (typeof navigator === "undefined") return "chromium";
  const browser = detectBrowser(navigator.userAgent, navigator.maxTouchPoints);
  if (browser === "safari" || browser === "ios") return "safari";
  return BROWSERS.find(entry => entry.id === browser)?.family === "firefox" ? "firefox" : "chromium";
}

function Keys({ keys, size = "lg" }: { keys: readonly string[]; size?: "lg" | "sm" }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {keys.map((key, index) => (
        <span key={key} className="inline-flex items-center gap-1.5">
          {index > 0 && <span className="text-muted-foreground">+</span>}
          <kbd
            className={cn(
              "inline-flex items-center justify-center rounded-md border border-b-[3px] bg-muted font-sans font-semibold text-foreground",
              size === "lg" ? "h-10 min-w-10 px-3 text-base" : "h-6 min-w-6 px-1.5 text-xs",
            )}
          >
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

const MAC_KEYS = ["⌘ Cmd", "⌥ Option", "I"] as const;
const PC_KEYS = ["F12"] as const;

const STEPS = ["signIn", "gateway", "devtools", "copy"] as const;

function CopyableValue({ value }: { value: string }) {
  const t = useTranslations();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("tokenDialog.clipboard.copied"));
    } catch {
      toast.error(t("tokenDialog.clipboard.failed"));
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="w-full cursor-pointer p-3 bg-muted rounded-md text-left text-sm font-mono text-muted-foreground break-all hover:bg-accent/90 transition-all flex items-start gap-2 group"
    >
      <span className="flex-1 pt-0.5">{value}</span>
      <Copy className="h-4 w-4 mt-0.75 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

export function SegaCookieDialog({ region, isOpen, onOpenChange, onTokenUpdate }: SegaCookieDialogProps) {
  const t = useTranslations();
  const game = useGame();
  const [view, setView] = useState<"intro" | "steps" | "input">("intro");
  const [inputReturnsTo, setInputReturnsTo] = useState<"intro" | "steps">("intro");
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const trimmed = value.trim();
  const isValid = CLAL_PATTERN.test(trimmed);
  const [browser, setBrowser] = useState<DevtoolsBrowser>("chromium");
  const [isMac, setIsMac] = useState(false);
  const steps = useWizardSteps(STEPS, isOpen, () => {
    setView("intro");
    setBrowser(detectDevtoolsBrowser());
    setIsMac(typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent));
  });
  const guide = DEVTOOLS_GUIDES[browser];
  const notFound = GATEWAY_NOT_FOUND[browser] ?? GATEWAY_NOT_FOUND.chromium;

  const browserSwitch = (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{t("tokenDialog.cookieGuide.whichBrowser")}</p>
      <div role="radiogroup" className="flex gap-1 rounded-lg bg-muted p-1">
        {DEVTOOLS_BROWSERS.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={browser === id}
            onClick={() => setBrowser(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors",
              browser === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`tokenDialog.cookieGuide.browsers.${id}`)}
          </button>
        ))}
      </div>
    </div>
  );

  const enterValue = (from: "intro" | "steps") => {
    setInputReturnsTo(from);
    setView("input");
  };

  const close = (open: boolean) => {
    if (!isSubmitting) onOpenChange(open);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onTokenUpdate(formatSegaCookie(trimmed));
      setValue("");
    } catch (error) {
      logger.error({ err: error }, "Token update failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (view === "intro") {
    return (
      <ResponsiveDialog open={isOpen} onOpenChange={close}>
        <ResponsiveDialogContent className="sm:max-w-md shadow">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Cookie className="h-5 w-5" />
              <span>{t("tokenDialog.methods.cookie.title")}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("tokenDialog.cookieGuide.intro.question")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <Smartphone className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="font-medium">{t("tokenDialog.cookieGuide.intro.mobileTitle")}</p>
              <p className="text-muted-foreground">{t("tokenDialog.cookieGuide.intro.mobileDescription")}</p>
            </div>
          </div>

          <div className="space-y-3">
            <MethodCard
              icon={Monitor}
              title={t("tokenDialog.cookieGuide.intro.desktopTitle")}
              description={t("tokenDialog.cookieGuide.intro.desktopDescription")}
              onClick={() => { steps.goTo(0); setView("steps"); }}
            />
            <MethodCard
              icon={ClipboardPaste}
              title={t("tokenDialog.cookieGuide.intro.haveCookieTitle")}
              description={t("tokenDialog.cookieGuide.intro.haveCookieDescription")}
              onClick={() => enterValue("intro")}
            />
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  if (view === "input") {
    return (
      <ResponsiveDialog open={isOpen} onOpenChange={close}>
        <ResponsiveDialogContent className="sm:max-w-md shadow">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Cookie className="h-5 w-5" />
              <span>{t("tokenDialog.methods.cookie.title")}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("tokenDialog.cookieGuide.inputDescription")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sega-cookie">{t("tokenDialog.cookieGuide.inputLabel")}</Label>
              <Input
                id="sega-cookie"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={t("tokenDialog.cookieGuide.inputPlaceholder")}
                aria-invalid={trimmed.length > 0 && !isValid}
                className="font-mono"
              />
              {trimmed.length > 0 && !isValid && (
                <p className="text-xs text-destructive">{t("tokenDialog.cookieGuide.invalid")}</p>
              )}
            </div>

            <div className="text-xs text-muted-foreground space-y-2">
              <p>{t("tokenDialog.cookieGuide.expiry")}</p>
              <p>{t("tokenDialog.credentialsSecureNote")}</p>
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setView(inputReturnsTo)}>
                {t("tokenDialog.cookieGuide.backToSteps")}
              </Button>
              <Button type="submit" className="flex-1" disabled={!isValid || isSubmitting}>
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                    {t("tokenDialog.savingCredentials")}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {t("tokenDialog.saveCredentials")}
                  </>
                )}
              </Button>
            </div>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    );
  }

  const stepBody: Record<(typeof STEPS)[number], ReactNode> = {
    signIn: (
      <>
        <p className="text-sm text-foreground">{t("tokenDialog.cookieGuide.signIn.description")}</p>
        <CopyableValue value={siteRoot(game.id, region).href} />
      </>
    ),
    gateway: (
      <>
        <p className="text-sm text-foreground">{t("tokenDialog.cookieGuide.gateway.description")}</p>
        <CopyableValue value={SEGA_AIME_GATEWAY.landingUrl} />
        {notFound && (
          <Image
            src={notFound.src}
            width={notFound.width}
            height={notFound.height}
            alt={t("tokenDialog.cookieGuide.gateway.screenshot")}
            className="h-auto w-full rounded-md border"
          />
        )}
      </>
    ),
    devtools: (
      <>
        {browserSwitch}
        {browser === "safari" && (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <p>{t("tokenDialog.cookieGuide.devtools.safari")}</p>
          </div>
        )}
        <p className="text-sm text-foreground">{t("tokenDialog.cookieGuide.devtools.description")}</p>
        <div className="flex justify-center rounded-lg border bg-muted/30 py-5">
          <Keys keys={isMac || browser === "safari" ? MAC_KEYS : PC_KEYS} />
        </div>
        {browser !== "safari" && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {t(isMac ? "tokenDialog.cookieGuide.devtools.otherPc" : "tokenDialog.cookieGuide.devtools.otherMac")}
            <Keys keys={isMac ? PC_KEYS : MAC_KEYS} size="sm" />
          </p>
        )}
      </>
    ),
    copy: (
      <>
        {browserSwitch}
        <p className="text-sm text-foreground">
          {t(`tokenDialog.cookieGuide.copy.${browser}`, { host: new URL(SEGA_AIME_GATEWAY.origin).host })}
        </p>
        {guide && <GuidePlayer key={`${browser}-copy`} frames={guide} alt={t("tokenDialog.cookieGuide.copy.title")} />}
      </>
    ),
  };

  return (
    <WizardDialog
      isOpen={isOpen}
      onOpenChange={close}
      icon={Cookie}
      step={steps.index}
      stepKey={steps.key}
      direction={steps.direction}
      title={t(`tokenDialog.cookieGuide.${steps.key}.title`, { net: game.brand.netName })}
      description={t("tokenDialog.cookieGuide.description")}
      onPrevious={() => steps.isFirst ? setView("intro") : steps.goTo(steps.index - 1)}
      wide={Boolean(guide) && steps.key === "copy"}
      next={steps.isLast
        ? <Button onClick={() => enterValue("steps")}>{t("tokenDialog.cookieGuide.enterCookie")}</Button>
        : <WizardNextButton onClick={() => steps.goTo(steps.index + 1)} />}
    >
      {stepBody[steps.key]}
    </WizardDialog>
  );
}
