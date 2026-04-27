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
import { resolveBaseUrl } from "@/lib/base-url";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";
import { AlertTriangle, Check, ChevronRight, Fish, Key, Smartphone, Snowflake, Wifi, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface TokenDialogCnProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

interface FeatureSupport {
  player: boolean;
  scores: boolean;
  recents: boolean;
  events: boolean;
}

const FULL_SUPPORT: FeatureSupport = { player: true, scores: true, recents: true, events: true };
const PROBER_SUPPORT: FeatureSupport = { player: true, scores: true, recents: false, events: false };

const FETCH_OPTIONS = [
  {
    id: "diving-fish",
    name: "水鱼查分器",
    description: "使用您的水鱼查分器登入用户名 或 已绑定的 QQ 帐户 ID 取得资料。",
    recommended: false,
    supported: false,
    features: PROBER_SUPPORT,
    icon: <Fish className="h-5 w-5 text-primary" />
  },
  {
    id: "lxns",
    name: "落雪咖啡屋查分器",
    description: "以落雪咖啡屋帐号登入授权取得资料。",
    recommended: false,
    supported: true,
    features: PROBER_SUPPORT,
    icon: <Snowflake className="h-5 w-5 text-primary" />
  },
  {
    id: "http-proxy",
    name: "HTTP 代理",
    description: "透过 HTTP 代理拦截手机微信中的舞萌 DX 小程序请求以取得资料。",
    recommended: false,
    supported: false,
    features: FULL_SUPPORT,
    icon: <Wifi className="h-5 w-5 text-primary" />
  },
  {
    id: "android-app",
    name: "Android 应用程式",
    description: "在 Android 装置上安装本应用程式以自动取得资料。",
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
        toast.error(`授权失败：${payload.error ?? "未知错误"}`);
        setIsAuthorizing(false);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isOpen, onAuthorized, onOpenChange]);

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
      toast.error("无法开启授权窗口，请允许本站弹窗后再试。");
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
            <span>落雪咖啡屋查分器</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            通过 OAuth 授权 {host || "本站"} 读取您在落雪咖啡屋查分器上的舞萌 DX 数据。授权可随时在落雪咖啡屋帐号设置中撤销。
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {!isLoadingConfig && !configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">落雪咖啡屋 OAuth 尚未配置</p>
                <p className="text-muted-foreground text-xs">
                  请联系管理员在服务器上设置 <code className="font-mono">LXNS_CLIENT_ID</code> 与 <code className="font-mono">LXNS_CLIENT_SECRET</code> 环境变量。
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-2">
            <p>点击下方按钮后，将在新窗口打开落雪咖啡屋的授权页面。授权完成后窗口会自动关闭并返回此处。</p>
            <p>我们仅会请求读取玩家资料相关的权限，不会写入您的数据。</p>
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
                等待授权完成…
              </>
            ) : (
              <>
                <Snowflake className="h-4 w-4 mr-2" />
                前往授权
              </>
            )}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

export function TokenDialogCn({
  isOpen,
  onOpenChange,
  onTokenUpdate,
}: TokenDialogCnProps) {
  const t = useTranslations();
  const [isLxnsDialogOpen, setIsLxnsDialogOpen] = useState(false);

  const subDialogOpen = isLxnsDialogOpen;

  const handleClose = (open: boolean) => {
    if (open) return;
    if (subDialogOpen) return;
    onOpenChange(false);
  };

  const handleOptionClick = (id: string) => {
    if (id === "lxns") {
      setIsLxnsDialogOpen(true);
    }
  };

  const handleLxnsAuthorized = async () => {
    // Token has been saved server-side by the OAuth callback; trigger a fetch
    // by calling onTokenUpdate with empty string (startFetchServer will read
    // the saved token from the DB when the input token is falsy).
    await onTokenUpdate("");
    onOpenChange(false);
  };

  return (
    <>
      <ResponsiveDialog open={isOpen} onOpenChange={handleClose}>
        <ResponsiveDialogContent className={cn("sm:max-w-md", subDialogOpen ? "opacity-70!" : "")}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>{t('tokenDialog.title')}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('tokenDialog.intlDescription')} {t('tokenDialog.credentialsStored')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
            {FETCH_OPTIONS.map(option => (
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
                        {t('tokenDialog.recommended')}
                      </Badge>)}
                      {!option.supported && (<Badge variant="secondary">
                        即将推出
                      </Badge>)}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <FeatureChip label="玩家资料" supported={option.features.player} />
                      <FeatureChip label="谱面成绩" supported={option.features.scores} />
                      <FeatureChip label="最近游玩" supported={option.features.recents} />
                      <FeatureChip label="活动数据" supported={option.features.events} />
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
    </>
  );
}
