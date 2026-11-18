"use client";

import { useGame } from "@/components/providers/game-provider";
import type { Region } from "@/lib/games/ids";
import { SEGA_AIME_GATEWAY } from "@/lib/games/sites";
import { trpc } from "@/lib/trpc-client";
import { GuidePlayer } from "@/components/guide-player";
import { cn } from "@/lib/utils";
import {
  Button,
  SelectFriendly,
  SelectFriendlyContent,
  SelectFriendlyItem,
  SelectFriendlyTrigger,
  SelectFriendlyValue,
} from "@tomomai/ui";
import { CircleCheck, CircleX, Download, ExternalLink, Info, LoaderCircle, Puzzle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BROWSER_ICONS } from "./browser-icons";
import { GatewayPreview } from "./gateway-preview";
import { USERSCRIPT_GUIDES, type GuideManager } from "./userscript-guides";
import { useTomomaiUserscript } from "./use-tomomai-userscript";
import { BROWSERS, MANAGER_ICONS, MANAGER_NAMES, MANAGER_OPTIONS, detectBrowser, type BrowserId, type ManagerId, type ManagerOption } from "./userscript-managers";
import { WizardDialog, WizardNextButton, useWizardSteps } from "./wizard-dialog";

interface SegaUserscriptDialogProps {
  region: Region;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the userscript has saved a new token for the region. */
  onTokenSaved: () => Promise<void>;
}

const TOKEN_POLL_MS = 3000;

type Step = "pick" | "script" | "cookies" | "send";

/** Managers that need a setting changed before the script can read the login cookie. */
const COOKIE_SETUP = ["tampermonkey", "violentmonkey"] as const satisfies readonly ManagerId[];
type CookieSetupManager = (typeof COOKIE_SETUP)[number];

function needsCookieSetup(manager: ManagerId | undefined): manager is CookieSetupManager {
  return (COOKIE_SETUP as readonly ManagerId[]).includes(manager as ManagerId);
}

type UsableOption = Exclude<ManagerOption, { support: "incompatible" }>;

function usableOptions(browser: BrowserId): UsableOption[] {
  return MANAGER_OPTIONS[browser].filter((option): option is UsableOption => option.support !== "incompatible");
}

function BrowserLabel({ browser }: { browser: BrowserId }) {
  const t = useTranslations();
  const Icon = BROWSER_ICONS[BROWSERS.find(entry => entry.id === browser)!.family];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {t(`tokenDialog.userscriptGuide.browsers.${browser}`)}
    </span>
  );
}

function Note({ icon: Icon = Info, children }: { icon?: typeof Info; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
      <p>{children}</p>
    </div>
  );
}

function ManagerIcon({ manager, className }: { manager: ManagerId; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny static logos, some of them SVG
  return <img src={MANAGER_ICONS[manager]} alt="" width={20} height={20} className={cn("h-5 w-5 flex-shrink-0 object-contain", className)} />;
}

function StoreLink({ option, onOpen }: { option: UsableOption; onOpen: () => void }) {
  const t = useTranslations();
  return (
    <a
      href={option.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-accent/50"
    >
      <ManagerIcon manager={option.manager} className="self-start mt-px" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{MANAGER_NAMES[option.manager]}</p>
        {option.support === "untested" && (
          <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
            <TriangleAlert className="h-3 w-3 mt-0.5 flex-shrink-0" />
            {t(`tokenDialog.userscriptGuide.caveats.${option.caveat}`)}
          </p>
        )}
      </div>
      <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </a>
  );
}

export function SegaUserscriptDialog({ region, isOpen, onOpenChange, onTokenSaved }: SegaUserscriptDialogProps) {
  const t = useTranslations();
  const game = useGame();
  const installedVersion = useTomomaiUserscript();
  const [browser, setBrowser] = useState<BrowserId>("other");
  const [manager, setManager] = useState<ManagerId | null>(null);
  const [siteOpened, setSiteOpened] = useState(false);

  const usable = usableOptions(browser);
  const incompatible = MANAGER_OPTIONS[browser].filter(option => option.support === "incompatible");
  const guided = manager && usable.some(option => option.manager === manager) ? manager : usable[0]?.manager;
  const guidedOption = usable.find(option => option.manager === guided);
  const flow: readonly Step[] = needsCookieSetup(guided) ? ["pick", "script", "cookies", "send"] : ["pick", "script", "send"];

  const steps = useWizardSteps<Step>(flow, isOpen, () => {
    setSiteOpened(false);
    setManager(null);
    setBrowser(typeof navigator === "undefined" ? "other" : detectBrowser(navigator.userAgent, navigator.maxTouchPoints));
    if (installedVersion) return "send";
  });
  const product = game.brand.productName;

  const sending = isOpen && steps.key === "send";
  const savedAt = trpc.user.getTokenSavedAt.useQuery(
    { game: game.id, region },
    { enabled: sending, refetchInterval: TOKEN_POLL_MS, refetchOnWindowFocus: true },
  );
  // The token stored when the send step opened, so only one the userscript saves afterwards counts.
  const watch = useRef<{ since: number; baseline?: string | null; handedOff?: boolean } | null>(null);
  useEffect(() => {
    if (!sending) {
      watch.current = null;
      return;
    }
    watch.current ??= { since: Date.now() };
    const state = watch.current;
    if (!savedAt.isSuccess || savedAt.dataUpdatedAt < state.since || state.handedOff) return;
    const current = savedAt.data ? new Date(savedAt.data).toISOString() : null;
    if (state.baseline === undefined) {
      state.baseline = current;
    } else if (current !== state.baseline) {
      state.handedOff = true;
      void onTokenSaved().catch(() => { state.handedOff = false; state.baseline = current; });
    }
  }, [sending, savedAt.isSuccess, savedAt.dataUpdatedAt, savedAt.data, onTokenSaved]);
  const guide = guided ? USERSCRIPT_GUIDES[browser]?.[guided === "tampermonkey" ? "tampermonkey-stable" : guided as GuideManager] : undefined;
  const chromiumFamily = BROWSERS.find(entry => entry.id === browser)?.family !== "firefox" && browser !== "safari" && browser !== "ios";

  const managerSwitch = usable.length > 1 && (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{t("tokenDialog.userscriptGuide.whichManager")}</p>
      <div role="radiogroup" className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {usable.map(option => (
          <button
            key={option.manager}
            type="button"
            role="radio"
            aria-checked={guided === option.manager}
            onClick={() => setManager(option.manager)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium transition-colors",
              guided === option.manager ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ManagerIcon manager={option.manager} className="h-4 w-4" />
            {MANAGER_NAMES[option.manager]}
          </button>
        ))}
      </div>
    </div>
  );

  const stepBody: Record<Step, ReactNode> = {
    pick: (
      <>
        <div className="text-sm leading-8">
          {t.rich(usable.length > 0 ? "tokenDialog.userscriptGuide.detected" : "tokenDialog.userscriptGuide.detectedNone", {
            browser: () => (
              <SelectFriendly value={browser} onValueChange={value => setBrowser(value as BrowserId)}>
                <SelectFriendlyTrigger className="inline-flex w-auto h-7 ml-1 align-middle" aria-label={t("tokenDialog.userscriptGuide.browserLabel")}>
                  <SelectFriendlyValue />
                </SelectFriendlyTrigger>
                <SelectFriendlyContent label={t("tokenDialog.userscriptGuide.browserLabel")}>
                  {BROWSERS.map(entry => (
                    <SelectFriendlyItem key={entry.id} value={entry.id}>
                      <BrowserLabel browser={entry.id} />
                    </SelectFriendlyItem>
                  ))}
                </SelectFriendlyContent>
              </SelectFriendly>
            ),
          })}
        </div>

        {usable.length > 0 ? (
          <>
            <div className="divide-y overflow-hidden rounded-lg border">
              {usable.map(option => (
                <StoreLink key={option.manager} option={option} onOpen={() => setManager(option.manager)} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("tokenDialog.userscriptGuide.pick.haveOne")}</p>
          </>
        ) : (
          <Note>{t(`tokenDialog.userscriptGuide.noManagers.${browser === "chrome-android" ? "chrome-android" : "other"}`)}</Note>
        )}

        {incompatible.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-xs font-medium text-muted-foreground">{t("tokenDialog.userscriptGuide.incompatibleHeading")}</p>
            {incompatible.map(option => (
              <div key={option.manager} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="relative mt-px flex-shrink-0">
                  <ManagerIcon manager={option.manager} className="grayscale opacity-60" />
                  <CircleX className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-background text-destructive" />
                </span>
                <span>
                  <span className="font-medium text-foreground/80">{MANAGER_NAMES[option.manager]}</span>
                  {option.support === "incompatible" && <> · {t(`tokenDialog.userscriptGuide.caveats.${option.caveat}`)}</>}
                </span>
              </div>
            ))}
          </div>
        )}
      </>
    ),
    script: (
      <>
        {managerSwitch}
        {chromiumFamily && guided && (
          <p className="text-sm text-foreground">{t("tokenDialog.userscriptGuide.script.allowUserScripts", { manager: MANAGER_NAMES[guided] })}</p>
        )}
        <p className="text-sm text-foreground">{t("tokenDialog.userscriptGuide.script.description")}</p>
        {guided === "scriptcat" && !chromiumFamily && browser !== "safari" && browser !== "ios" && (
          <p className="text-sm text-foreground">{t("tokenDialog.userscriptGuide.script.scriptcatPermission")}</p>
        )}
        {guided === "scriptcat" && chromiumFamily && <Note icon={TriangleAlert}>{t("tokenDialog.userscriptGuide.script.scriptcatRestart")}</Note>}
        <Button asChild variant="outline" className="w-full">
          <a href="/userscript.user.js" target="_blank" rel="noopener">
            <Download className="h-4 w-4 mr-2" />
            {t("tokenDialog.userscriptGuide.script.button")}
          </a>
        </Button>
        {guide && guide.script.length > 0 && <GuidePlayer key={`${browser}-${guided}-script`} frames={guide.script} alt={t("tokenDialog.userscriptGuide.script.title", { product })} />}
      </>
    ),
    cookies: needsCookieSetup(guided) && (
      <>
        <p className="text-sm text-foreground">{t(`tokenDialog.userscriptGuide.cookies.${guided}`)}</p>
        {guidedOption?.support === "untested" && <Note icon={TriangleAlert}>{t(`tokenDialog.userscriptGuide.caveats.${guidedOption.caveat}`)}</Note>}
        {guide && guide.cookies.length > 0 && <GuidePlayer key={`${browser}-${guided}-cookies`} frames={guide.cookies} alt={t("tokenDialog.userscriptGuide.cookies.title")} />}
      </>
    ),
    send: (
      <>
        {installedVersion && (
          <p className="flex items-center gap-2 text-sm text-primary">
            <CircleCheck className="h-4 w-4 flex-shrink-0" />
            {t("tokenDialog.userscriptGuide.send.installed", { product })}
          </p>
        )}
        <GatewayPreview />
        <p className="text-sm text-foreground">{t("tokenDialog.userscriptGuide.send.description", { product })}</p>
        <Button asChild className="w-full">
          <a href={SEGA_AIME_GATEWAY.landingUrl} target="_blank" rel="noopener noreferrer" onClick={() => setSiteOpened(true)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("tokenDialog.userscriptGuide.send.gatewayButton")}
          </a>
        </Button>
        {guided === "scriptcat" && !installedVersion && (
          <>
            <p className="text-sm text-foreground">{t("tokenDialog.userscriptGuide.send.scriptcatPrompt")}</p>
            {guide && guide.cookies.length > 0 && <GuidePlayer key={`${browser}-scriptcat-prompt`} frames={guide.cookies} alt={t("tokenDialog.userscriptGuide.send.title")} />}
          </>
        )}
        {siteOpened && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {t("tokenDialog.userscriptGuide.send.waiting")}
          </div>
        )}
      </>
    ),
  };

  return (
    <WizardDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      icon={Puzzle}
      step={steps.index}
      stepKey={steps.key}
      direction={steps.direction}
      title={t(`tokenDialog.userscriptGuide.${steps.key}.title`, { product })}
      description={t("tokenDialog.userscriptGuide.description", { product })}
      onPrevious={() => steps.goTo(steps.index - 1)}
      previousDisabled={steps.isFirst}
      wide={Boolean(guide) && (steps.key === "script" || steps.key === "cookies" || (steps.key === "send" && guided === "scriptcat" && !installedVersion))}
      next={steps.isLast ? null : <WizardNextButton onClick={() => steps.goTo(steps.index + 1)} disabled={steps.key === "pick" && usable.length === 0} />}
    >
      {stepBody[steps.key]}
    </WizardDialog>
  );
}
