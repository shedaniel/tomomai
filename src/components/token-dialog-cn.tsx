"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/dialog-friendly";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { resolveBaseUrl } from "@/lib/base-url";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronRight, Copy, Fish, Key, Smartphone, Snowflake, Wifi, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Region } from "@/lib/types";

interface TokenDialogCnProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
  startSessionPolling?: (region: Region, onSessionDetected?: () => void) => void;
  stopSessionPolling?: () => void;
}

interface FeatureSupport {
  player: boolean;
  scores: boolean;
  recents: boolean;
  events: boolean;
}

const FULL_SUPPORT: FeatureSupport = { player: true, scores: true, recents: true, events: true };
const PROBER_SUPPORT: FeatureSupport = { player: true, scores: true, recents: false, events: false };

const FETCH_OPTIONS_KEYS = [
  {
    id: "diving-fish",
    i18nKey: "divingFish",
    recommended: false,
    supported: false,
    disabledReason: "tomomai.lol 与水鱼查分器之间的连线不稳定，请求经常逾时，因此暂时停用。",
    features: PROBER_SUPPORT,
    icon: <Fish className="h-5 w-5 text-primary" />
  },
  {
    id: "lxns",
    i18nKey: "lxns",
    recommended: false,
    supported: true,
    features: PROBER_SUPPORT,
    icon: <Snowflake className="h-5 w-5 text-primary" />
  },
  {
    id: "http-proxy",
    i18nKey: "httpProxy",
    recommended: false,
    supported: true,
    features: FULL_SUPPORT,
    icon: <Wifi className="h-5 w-5 text-primary" />
  },
  {
    id: "android-app",
    i18nKey: "androidApp",
    recommended: false,
    supported: false,
    features: FULL_SUPPORT,
    icon: <Smartphone className="h-5 w-5 text-primary" />
  }
] as const;

function FeatureChip({ label, supported }: { label: string; supported: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        supported ? "" : "text-muted-foreground/70 line-through",
      )}
    >
      {supported ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {label}
    </span>
  );
}

interface LxnsAuthSubDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorized: () => Promise<void>;
}

function LxnsAuthSubDialog({ isOpen, onOpenChange, onAuthorized }: LxnsAuthSubDialogProps) {
  const t = useTranslations();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };
  const { data: configData, isLoading: isLoadingConfig } = trpc.user.getLxnsOAuthConfigured.useQuery(
    undefined,
    { enabled: isOpen, refetchOnWindowFocus: false }
  );
  const configured = configData?.configured ?? false;
  const host = typeof window !== "undefined" ? new URL(resolveBaseUrl()).host : "";

  useEffect(() => {
    if (!isOpen) return;
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; payload?: { ok?: boolean; error?: string } } | null;
      if (!data || data.source !== "lxns-oauth") return;
      const payload = data.payload ?? {};
      try {
        popupRef.current?.close();
      } catch {
        // ignore
      }
      popupRef.current = null;
      stopPolling();
      if (payload.ok) {
        try {
          await onAuthorized();
          onOpenChange(false);
        } catch {
          // onAuthorized's caller toasts the error; keep dialog open
        } finally {
          setIsAuthorizing(false);
        }
      } else {
        toast.error(t('tokenDialog.lxns.authFailed', { error: payload.error ?? t('tokenDialog.lxns.unknownError') }));
        setIsAuthorizing(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isOpen, onAuthorized, onOpenChange, t]);

  const handleAuthorize = () => {
    if (!configured) return;
    setIsAuthorizing(true);
    const w = 520;
    const h = 720;
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
    const popup = window.open(
      "/api/oauth/lxns/start",
      "lxns-oauth",
      `width=${w},height=${h},left=${left},top=${top},popup=yes`
    );
    if (!popup) {
      setIsAuthorizing(false);
      toast.error(t('tokenDialog.lxns.popupBlocked'));
      return;
    }
    popupRef.current = popup;

    stopPolling();
    pollIntervalRef.current = window.setInterval(() => {
      if (popupRef.current?.closed) {
        stopPolling();
        popupRef.current = null;
        setIsAuthorizing(false);
      }
    }, 500);
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <ResponsiveDialogContent className="sm:max-w-md shadow">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center space-x-2">
            <Snowflake className="h-5 w-5" />
            <span>{t('tokenDialog.lxns.title')}</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('tokenDialog.lxns.description', { host: host || "tomomai" })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {!isLoadingConfig && !configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">{t('tokenDialog.lxns.notConfiguredTitle')}</p>
                <p className="text-muted-foreground text-xs">
                  {t.rich('tokenDialog.lxns.notConfiguredMessage', { code: (chunks) => <code>{chunks}</code> })}
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-2">
            <p>{t('tokenDialog.lxns.instructionsLine1')}</p>
            <p>{t('tokenDialog.lxns.instructionsLine2')}</p>
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={!configured || isAuthorizing || isLoadingConfig}
            onClick={handleAuthorize}
          >
            {isAuthorizing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                {t('tokenDialog.lxns.authorizingButton')}
              </>
            ) : (
              <>
                <Snowflake className="h-4 w-4 mr-2" />
                {t('tokenDialog.lxns.authorizeButton')}
              </>
            )}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

interface DivingFishAuthSubDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorized: () => Promise<void>;
}

function DivingFishAuthSubDialog({ isOpen, onOpenChange, onAuthorized }: DivingFishAuthSubDialogProps) {
  const t = useTranslations();
  const [importToken, setImportToken] = useState("");
  const [kind, setKind] = useState<"username" | "qq">("username");
  const [identifier, setIdentifier] = useState("");
  const [activeTab, setActiveTab] = useState<"import-token" | "nickname">("import-token");
  const [nicknameTabVisited, setNicknameTabVisited] = useState(false);

  const { data: configData, isLoading: isLoadingConfig } = trpc.user.getDivingFishConfigured.useQuery(
    undefined,
    { enabled: isOpen, refetchOnWindowFocus: false }
  );
  const configured = configData?.configured ?? false;

  const { data: challengeData, refetch: refetchChallenge } = trpc.user.getDivingFishNicknameChallenge.useQuery(
    undefined,
    { enabled: isOpen && configured && nicknameTabVisited, refetchOnWindowFocus: false }
  );

  const verifyImport = trpc.user.verifyDivingFishImportToken.useMutation();
  const verifyNickname = trpc.user.verifyDivingFishNickname.useMutation();

  useEffect(() => {
    if (!isOpen) {
      setImportToken("");
      setIdentifier("");
      setActiveTab("import-token");
      setNicknameTabVisited(false);
      verifyImport.reset();
      verifyNickname.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleImportSubmit = async () => {
    if (!importToken.trim()) return;
    try {
      await verifyImport.mutateAsync({ importToken: importToken.trim() });
      try {
        await onAuthorized();
        onOpenChange(false);
      } catch {
        // caller toasts the error
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tokenDialog.divingFish.verifyFailedFallback');
      toast.error(message);
    }
  };

  const handleNicknameVerify = async () => {
    if (!identifier.trim()) return;
    try {
      await verifyNickname.mutateAsync({ kind, value: identifier.trim() });
      try {
        await onAuthorized();
        onOpenChange(false);
      } catch {
        // caller toasts the error
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('tokenDialog.divingFish.verifyFailedFallback');
      toast.error(message);
    }
  };

  const isImportBusy = verifyImport.isPending;
  const isNicknameBusy = verifyNickname.isPending;

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <ResponsiveDialogContent className="sm:max-w-md shadow">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center space-x-2">
            <Fish className="h-5 w-5" />
            <span>{t('tokenDialog.divingFish.title')}</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('tokenDialog.divingFish.description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {!isLoadingConfig && !configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">{t('tokenDialog.divingFish.notConfiguredTitle')}</p>
                <p className="text-muted-foreground text-xs">
                  {t.rich('tokenDialog.divingFish.notConfiguredMessage', { code: (chunks) => <code>{chunks}</code> })}
                </p>
              </div>
            </div>
          )}

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              const tab = v as "import-token" | "nickname";
              setActiveTab(tab);
              if (tab === "nickname") setNicknameTabVisited(true);
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="import-token">{t('tokenDialog.divingFish.importTokenTab')}</TabsTrigger>
              <TabsTrigger value="nickname">{t('tokenDialog.divingFish.nicknameTab')}</TabsTrigger>
            </TabsList>

            <AutoHeight deps={[activeTab, challengeData?.challenge, kind, isImportBusy, isNicknameBusy, configured, isLoadingConfig]}>
            <div className="pt-3">
            <TabsContent value="import-token" className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t('tokenDialog.divingFish.importTokenInstructions')}</p>
                <p className="font-medium text-foreground">{t('tokenDialog.divingFish.importTokenSecureNote')}</p>
              </div>
              <Input
                type="password"
                placeholder={t('tokenDialog.divingFish.importTokenPlaceholder')}
                value={importToken}
                onChange={(e) => setImportToken(e.target.value)}
                disabled={!configured || isImportBusy}
                autoComplete="off"
              />
              <Button
                type="button"
                className="w-full"
                disabled={!configured || isImportBusy || !importToken.trim()}
                onClick={handleImportSubmit}
              >
                {isImportBusy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                    {t('tokenDialog.divingFish.importTokenVerifying')}
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    {t('tokenDialog.divingFish.importTokenButton')}
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="nickname" className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t('tokenDialog.divingFish.nicknameInstructions')}</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>{t('tokenDialog.divingFish.nicknameStep1')}</li>
                  <li>{t('tokenDialog.divingFish.nicknameStep2')}</li>
                  <li>{t('tokenDialog.divingFish.nicknameStep3')}</li>
                  <li>{t('tokenDialog.divingFish.nicknameStep4')}</li>
                </ol>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t('tokenDialog.divingFish.nicknameLabel')}</p>
                <p className="font-mono text-2xl font-semibold tracking-widest">
                  {challengeData?.challenge ?? t('tokenDialog.divingFish.challengePlaceholder')}
                </p>
                <button
                  type="button"
                  onClick={() => refetchChallenge()}
                  className="text-xs text-muted-foreground underline mt-1 hover:text-foreground"
                >
                  {t('tokenDialog.divingFish.refreshCode')}
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">{t('tokenDialog.divingFish.nicknameTypeLabel')}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={kind === "username" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setKind("username")}
                    disabled={isNicknameBusy}
                  >
                    {t('tokenDialog.divingFish.nicknameUsername')}
                  </Button>
                  <Button
                    type="button"
                    variant={kind === "qq" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setKind("qq")}
                    disabled={isNicknameBusy}
                  >
                    {t('tokenDialog.divingFish.nicknameQQ')}
                  </Button>
                </div>
              </div>

              <Input
                placeholder={t('tokenDialog.divingFish.nicknameIdentifierPlaceholder')}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={!configured || isNicknameBusy}
                autoComplete="off"
              />

              <Button
                type="button"
                className="w-full"
                disabled={!configured || isNicknameBusy || !identifier.trim()}
                onClick={handleNicknameVerify}
              >
                {isNicknameBusy ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                    {t('tokenDialog.divingFish.nicknameVerifying')}
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {t('tokenDialog.divingFish.nicknameVerifyButton')}
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t('tokenDialog.divingFish.nicknameRevertNote')}
              </p>
            </TabsContent>
            </div>
            </AutoHeight>
          </Tabs>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ClashImportRow({ t, onCopy }: { t: ReturnType<typeof useTranslations>; onCopy: (value: string) => Promise<void> }) {
  const yamlPath = "/api/cn-proxy/yaml";
  const absoluteUrl = `${resolveBaseUrl()}${yamlPath}`;
  const clashUrl = `clash://install-config?url=${encodeURIComponent(absoluteUrl)}`;

  return (
    <div className="flex items-stretch gap-2 rounded-md border bg-muted/40 p-2">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('tokenDialog.httpProxy.clashConfigUrl')}</p>
        <button
          type="button"
          onClick={() => onCopy(absoluteUrl)}
          className="flex items-center gap-1 font-mono text-sm hover:text-primary truncate"
        >
          {yamlPath}
          <Copy className="h-3 w-3 opacity-60 shrink-0" />
        </button>
      </div>
      <a
        href={clashUrl}
        className="shrink-0 self-stretch inline-flex items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
      >
        {t('tokenDialog.httpProxy.clashImportButton')}
      </a>
    </div>
  );
}

interface HttpProxyAuthSubDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorized: () => Promise<void>;
  startSessionPolling?: (region: Region, onSessionDetected?: () => void) => void;
  stopSessionPolling?: () => void;
}

function HttpProxyAuthSubDialog({ isOpen, onOpenChange, onAuthorized, startSessionPolling, stopSessionPolling }: HttpProxyAuthSubDialogProps) {
  const t = useTranslations();
  const { data: configData, isLoading: isLoadingConfig } = trpc.user.getCnProxyConfigured.useQuery(
    undefined,
    { enabled: isOpen, refetchOnWindowFocus: false }
  );
  const configured = configData?.configured ?? false;
  const proxyHost = configData?.host ?? "";
  const proxyPort = configData?.port ?? "2560";

  const generateLink = trpc.user.getCnProxyAuthLink.useMutation();
  const linkData = generateLink.data;

  // Once a link is generated, watch for a new fetch session being created
  // server-side (which the webhook will do once the OAuth handoff completes).
  // Reuses the same session-polling infra the intl/jp flows use.
  useEffect(() => {
    if (!isOpen || !linkData || !startSessionPolling || !stopSessionPolling) return;
    startSessionPolling("cn", () => {
      onOpenChange(false);
      // Mirror the LXNS / DivingFish flows: notify the parent so it can
      // trigger a fetch (onTokenUpdate("")) and close the outer dialog.
      void onAuthorized().catch(() => {
        // caller toasts the error
      });
    });
    return () => stopSessionPolling();
  }, [isOpen, linkData, startSessionPolling, stopSessionPolling, onOpenChange, onAuthorized]);

  useEffect(() => {
    if (!isOpen) {
      generateLink.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleGenerate = () => {
    generateLink.mutate();
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('tokenDialog.httpProxy.copySuccess'));
    } catch {
      toast.error(t('tokenDialog.httpProxy.copyFailed'));
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <ResponsiveDialogContent className="sm:max-w-md shadow">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center space-x-2">
            <Wifi className="h-5 w-5" />
            <span>{t('tokenDialog.httpProxy.title')}</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t('tokenDialog.httpProxy.description')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <AutoHeight deps={[isLoadingConfig, configured, !!linkData, generateLink.isPending]}>
          <div className="space-y-4">
            {!isLoadingConfig && !configured && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">{t('tokenDialog.httpProxy.notConfiguredTitle')}</p>
                  <p className="text-muted-foreground text-xs">
                    {t.rich('tokenDialog.httpProxy.notConfiguredMessage', { code: (chunks) => <code>{chunks}</code> })}
                  </p>
                </div>
              </div>
            )}

            {configured && (
              <div className="space-y-2">
                <p className="text-xs font-medium">{t('tokenDialog.httpProxy.step1Title')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('tokenDialog.httpProxy.step1Host')}</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(proxyHost)}
                      className="flex items-center gap-1 font-mono text-sm hover:text-primary"
                    >
                      {proxyHost}
                      <Copy className="h-3 w-3 opacity-60" />
                    </button>
                  </div>
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('tokenDialog.httpProxy.step1Port')}</p>
                    <button
                      type="button"
                      onClick={() => handleCopy(proxyPort)}
                      className="flex items-center gap-1 font-mono text-sm hover:text-primary"
                    >
                      {proxyPort}
                      <Copy className="h-3 w-3 opacity-60" />
                    </button>
                  </div>
                </div>
                <ClashImportRow t={t} onCopy={handleCopy} />
              </div>
            )}

            {configured && (
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  {t('tokenDialog.httpProxy.step2Title', { generateOrRegenerate: linkData ? t('tokenDialog.httpProxy.step2Regenerate') : t('tokenDialog.httpProxy.step2Generate') })}
                </p>
                <Button
                  type="button"
                  variant={linkData ? "outline" : "default"}
                  className="w-full"
                  disabled={generateLink.isPending}
                  onClick={handleGenerate}
                >
                  {generateLink.isPending ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                      {t('tokenDialog.httpProxy.step2GeneratingButton')}
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      {linkData ? t('tokenDialog.httpProxy.step2RegenerateButton') : t('tokenDialog.httpProxy.step2GenerateButton')}
                    </>
                  )}
                </Button>
                {generateLink.error && (
                  <p className="text-xs text-destructive">
                    {t('tokenDialog.httpProxy.step2ErrorPrefix')}{generateLink.error.message}
                  </p>
                )}
              </div>
            )}

            {linkData && (
              <div className="space-y-2">
                <p className="text-xs font-medium">{t('tokenDialog.httpProxy.step3Title')}</p>
                <div className="rounded-md border bg-muted/40 p-2 break-all text-xs font-mono">
                  {linkData.url}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => handleCopy(linkData.url)}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t('tokenDialog.httpProxy.step3Copy')}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t('tokenDialog.httpProxy.step3CopyNote')}
                </p>
              </div>
            )}
          </div>
        </AutoHeight>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function TokenDialogCn({
  isOpen,
  onOpenChange,
  onTokenUpdate,
  startSessionPolling,
  stopSessionPolling,
}: TokenDialogCnProps) {
  const t = useTranslations();
  const [isLxnsDialogOpen, setIsLxnsDialogOpen] = useState(false);
  const [isDivingFishDialogOpen, setIsDivingFishDialogOpen] = useState(false);
  const [isHttpProxyDialogOpen, setIsHttpProxyDialogOpen] = useState(false);

  const subDialogOpen = isLxnsDialogOpen || isDivingFishDialogOpen || isHttpProxyDialogOpen;

  const fetchOptions = FETCH_OPTIONS_KEYS.map(option => ({
    ...option,
    name: t(`tokenDialog.fetchOptions.${option.i18nKey}.name`),
    description: t(`tokenDialog.fetchOptions.${option.i18nKey}.description`),
    disabledReason: "disabledReason" in option ? option.disabledReason : undefined,
  }));

  const handleClose = (open: boolean) => {
    if (open) return;
    if (subDialogOpen) return;
    onOpenChange(false);
  };

  const handleOptionClick = (id: string) => {
    if (id === "lxns") {
      setIsLxnsDialogOpen(true);
    } else if (id === "diving-fish") {
      setIsDivingFishDialogOpen(true);
    } else if (id === "http-proxy") {
      setIsHttpProxyDialogOpen(true);
    }
  };

  const handleSubAuthorized = async () => {
    // Token has been saved server-side; trigger a fetch by calling
    // onTokenUpdate with an empty string so startFetchServer reads the
    // saved token from the DB.
    await onTokenUpdate("");
    onOpenChange(false);
  };

  const handleLxnsAuthorized = handleSubAuthorized;
  const handleDivingFishAuthorized = handleSubAuthorized;

  return (
    <>
      <ResponsiveDialog open={isOpen} onOpenChange={handleClose}>
        <ResponsiveDialogContent className={cn("sm:max-w-md", subDialogOpen ? "opacity-70!" : "")}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>{t('tokenDialog.cnTitle')}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('tokenDialog.cnDescription')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">{t('tokenDialog.cnExperimentalWarningTitle')}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {t('tokenDialog.cnExperimentalWarningMessage')}
                </p>
              </div>
            </div>
            {fetchOptions.map(option => (
              <button
                key={option.id}
                onClick={() => handleOptionClick(option.id)}
                disabled={!option.supported}
                className="w-full p-4 border-2 rounded-lg hover:border-primary hover:bg-accent/50 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-1 p-2 rounded-md bg-primary/10">
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-base">{option.name}</span>
                      {option.recommended && (<Badge variant="default">
                        {t('tokenDialog.recommendedBadge')}
                      </Badge>)}
                      {!option.supported && (<Badge variant="secondary">
                        {option.disabledReason ? t('tokenDialog.disabledBadge') : t('tokenDialog.comingSoonBadge')}
                      </Badge>)}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                    {option.disabledReason && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                        <AlertTriangle className="inline-block h-3 w-3 mr-1 align-[-2px]" />
                        {option.disabledReason}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <FeatureChip label={t('tokenDialog.features.playerInfo')} supported={option.features.player} />
                      <FeatureChip label={t('tokenDialog.features.scores')} supported={option.features.scores} />
                      <FeatureChip label={t('tokenDialog.features.recents')} supported={option.features.recents} />
                      <FeatureChip label={t('tokenDialog.features.events')} supported={option.features.events} />
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </button>
            ))}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <LxnsAuthSubDialog
        isOpen={isLxnsDialogOpen}
        onOpenChange={setIsLxnsDialogOpen}
        onAuthorized={handleLxnsAuthorized}
      />

      <DivingFishAuthSubDialog
        isOpen={isDivingFishDialogOpen}
        onOpenChange={setIsDivingFishDialogOpen}
        onAuthorized={handleDivingFishAuthorized}
      />

      <HttpProxyAuthSubDialog
        isOpen={isHttpProxyDialogOpen}
        onOpenChange={setIsHttpProxyDialogOpen}
        onAuthorized={handleSubAuthorized}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />
    </>
  );
}
