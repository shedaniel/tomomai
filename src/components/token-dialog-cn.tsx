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

const FETCH_OPTIONS = [
  {
    id: "diving-fish",
    name: "水鱼查分器",
    description: "使用您的水鱼查分器登入用户名 或 已绑定的 QQ 帐户 ID 取得资料。",
    recommended: false,
    supported: false,
    disabledReason: "tomomai.lol 与水鱼查分器之间的连线不稳定，请求经常逾时，因此暂时停用。",
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
    supported: true,
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

interface DivingFishAuthSubDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorized: () => Promise<void>;
}

function DivingFishAuthSubDialog({ isOpen, onOpenChange, onAuthorized }: DivingFishAuthSubDialogProps) {
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
      const message = err instanceof Error ? err.message : "验证失败";
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
      const message = err instanceof Error ? err.message : "验证失败";
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
            <span>水鱼查分器</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            将您的水鱼查分器帐号绑定到本站，绑定后我们会通过水鱼查分器的开发者接口读取您的舞萌 DX 数据。请先选择以下任一方式验证您拥有该帐号。
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-4">
          {!isLoadingConfig && !configured && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
              <div className="space-y-1">
                <p className="font-medium">水鱼查分器尚未配置</p>
                <p className="text-muted-foreground text-xs">
                  请联系管理员在服务器上设置 <code className="font-mono">DIVINGFISH_DEV_TOKEN</code> 环境变量。
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
              <TabsTrigger value="import-token">Import-Token 验证</TabsTrigger>
              <TabsTrigger value="nickname">昵称验证</TabsTrigger>
            </TabsList>

            <AutoHeight deps={[activeTab, challengeData?.challenge, kind, isImportBusy, isNicknameBusy, configured, isLoadingConfig]}>
            <div className="pt-3">
            <TabsContent value="import-token" className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>在水鱼查分器 &quot;编辑个人资料&quot; 页面生成 Import-Token，并粘贴到此处。</p>
                <p className="font-medium text-foreground">我们仅会用此 Token 验证一次帐号归属，验证后立即丢弃，不会保存。</p>
              </div>
              <Input
                type="password"
                placeholder="粘贴您的 Import-Token"
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
                    验证中…
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    验证并绑定
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="nickname" className="space-y-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>请按照以下步骤完成验证：</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>登入水鱼查分器</li>
                  <li>在 &quot;编辑个人资料&quot; 中将昵称改为下方代码</li>
                  <li>保存修改</li>
                  <li>回到此处填写您的用户名或 QQ 并验证</li>
                </ol>
              </div>

              <div className="rounded-md border bg-muted/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">请将昵称改为</p>
                <p className="font-mono text-2xl font-semibold tracking-widest">
                  {challengeData?.challenge ?? "-------"}
                </p>
                <button
                  type="button"
                  onClick={() => refetchChallenge()}
                  className="text-xs text-muted-foreground underline mt-1 hover:text-foreground"
                >
                  刷新代码
                </button>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">类型</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={kind === "username" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setKind("username")}
                    disabled={isNicknameBusy}
                  >
                    用户名
                  </Button>
                  <Button
                    type="button"
                    variant={kind === "qq" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setKind("qq")}
                    disabled={isNicknameBusy}
                  >
                    QQ
                  </Button>
                </div>
              </div>

              <Input
                placeholder={kind === "username" ? "您的水鱼查分器用户名" : "您绑定的 QQ 号"}
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
                    验证中…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    我已修改，开始验证
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                验证成功后您可以将昵称改回原本的设定。
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

interface HttpProxyAuthSubDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorized: () => Promise<void>;
  startSessionPolling?: (region: Region, onSessionDetected?: () => void) => void;
  stopSessionPolling?: () => void;
}

function HttpProxyAuthSubDialog({ isOpen, onOpenChange, onAuthorized, startSessionPolling, stopSessionPolling }: HttpProxyAuthSubDialogProps) {
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
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <ResponsiveDialogContent className="sm:max-w-md shadow">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center space-x-2">
            <Wifi className="h-5 w-5" />
            <span>HTTP 代理</span>
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            将手机的全局 HTTP 代理指向我们的服务器，然后在微信中打开下方链接完成授权。整个过程仅授权一次。
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <AutoHeight deps={[isLoadingConfig, configured, !!linkData, generateLink.isPending]}>
          <div className="space-y-4">
            {!isLoadingConfig && !configured && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">HTTP 代理服务尚未配置</p>
                  <p className="text-muted-foreground text-xs">
                    请联系管理员设置 <code className="font-mono">CN_PROXY_HOST</code> 及 <code className="font-mono">CN_PROXY_TOKEN_SECRET</code> 环境变量。
                  </p>
                </div>
              </div>
            )}

            {configured && (
              <div className="space-y-2">
                <p className="text-xs font-medium">第 1 步：在手机 Wi-Fi 设置中将 HTTP 代理设为</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border bg-muted/40 p-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">主机名</p>
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
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">端口</p>
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
              </div>
            )}

            {configured && (
              <div className="space-y-2">
                <p className="text-xs font-medium">
                  第 2 步：{linkData ? "如链接失效，可重新生成" : "生成授权链接"}
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
                      生成中…
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      {linkData ? "重新生成" : "生成授权链接"}
                    </>
                  )}
                </Button>
                {generateLink.error && (
                  <p className="text-xs text-destructive">
                    {generateLink.error.message}
                  </p>
                )}
              </div>
            )}

            {linkData && (
              <div className="space-y-2">
                <p className="text-xs font-medium">第 3 步：复制下方链接，发送到任意微信聊天后点击打开</p>
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
                  复制链接
                </Button>
                <p className="text-xs text-muted-foreground">
                  授权完成后微信会跳转到一个结果页面。届时请关闭该页面，回到 tomomai 查看导入进度，并记得在 Wi-Fi 设置中关闭代理。
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
              <span>{t('tokenDialog.title')}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('tokenDialog.intlDescription')} {t('tokenDialog.credentialsStored')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
            {FETCH_OPTIONS.map(option => {
              const disabledReason = "disabledReason" in option ? option.disabledReason : undefined;
              return (
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
                        {disabledReason ? "暂时停用" : "即将推出"}
                      </Badge>)}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                    {disabledReason && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500 leading-relaxed">
                        <AlertTriangle className="inline-block h-3 w-3 mr-1 align-[-2px]" />
                        {disabledReason}
                      </p>
                    )}
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
              );
            })}
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
