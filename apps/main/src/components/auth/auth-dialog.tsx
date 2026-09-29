"use client";

import { useState } from "react";
import {
  Button,
  DiscordIcon,
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  XIcon,
} from "@tomomai/ui";
import { AlertCircle, Dot, KeyRound, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/animate-ui/components/radix/checkbox";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { PolicyDialog } from "@/components/policy-dialog";
import { useLocale } from "@/components/providers/locale-provider";
import { authClient, signIn } from "@/lib/auth-client";
import { getTransition } from "@/lib/animation-constants";
import { useGame } from "@/components/providers/game-provider";
import { isGameCnExclusive } from "@/lib/games/frontend";
import { trpc } from "@/lib/trpc-client";
import { cn } from "@/lib/utils";

export type AuthDialogMode = "signin" | "signup";
type SocialProvider = "discord" | "twitter";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AuthDialogMode;
  onModeChange: (mode: AuthDialogMode) => void;
  error: string | null;
  onErrorChange: (error: string | null) => void;
  callbackURL: string;
}

function QQIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
    </svg>
  );
}

const PROVIDER_STYLES: Record<SocialProvider, string> = {
  discord: "bg-indigo-500/90 hover:bg-indigo-500 text-white border border-input dark:bg-indigo-500/80 dark:hover:bg-indigo-500",
  twitter: "bg-neutral-900 hover:bg-neutral-800 text-white border border-input",
};

function ProviderButton({
  provider,
  label,
  pending,
  disabled,
  onClick,
}: {
  provider: SocialProvider | "qq";
  label: string;
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = provider === "discord" ? DiscordIcon : provider === "twitter" ? XIcon : QQIcon;
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full justify-center font-semibold",
        provider !== "qq" && PROVIDER_STYLES[provider],
      )}
    >
      {pending ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      {label}
    </Button>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive dark:text-red-300">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <p className="whitespace-pre-line">{message}</p>
    </div>
  );
}

function Notice({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function hasPendingInviteCookie() {
  return document.cookie.split(";").some((c) => c.trim().startsWith("pendingInviteCode="));
}

function useSocialSignIn(callbackURL: string, onError: (message: string) => void) {
  const t = useTranslations("auth.errors");
  const [pending, setPending] = useState<SocialProvider | null>(null);

  const start = async (provider: SocialProvider, requestSignUp: boolean) => {
    setPending(provider);
    try {
      const result = await signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
        requestSignUp,
      });
      if (result?.error) {
        setPending(null);
        onError(t("generic"));
      }
      // On success the browser is already navigating to the provider; keep the spinner.
    } catch {
      setPending(null);
      onError(t("generic"));
    }
  };

  return { pending, start };
}

function SignInPanel({
  callbackURL,
  onError,
  onSwitch,
}: {
  callbackURL: string;
  onError: (message: string | null) => void;
  onSwitch: () => void;
}) {
  const t = useTranslations("auth");
  const { data: options } = trpc.user.getSignInOptions.useQuery(undefined, { staleTime: Infinity });
  const { pending, start } = useSocialSignIn(callbackURL, onError);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const cnMode = isGameCnExclusive(useGame());
  const busy = pending !== null || passkeyPending;

  const handlePasskey = async () => {
    onError(null);
    setPasskeyPending(true);
    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        setPasskeyPending(false);
        if ((result.error as { code?: string }).code === "AUTH_CANCELLED") return;
        onError(result.error.message ?? t("passkey.errorGeneric"));
        return;
      }
      window.location.assign(callbackURL);
    } catch {
      setPasskeyPending(false);
      onError(t("passkey.errorGeneric"));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {cnMode ? (
        <ProviderButton provider="qq" label="以 QQ 继续" pending={pending === "discord"} disabled={busy} onClick={() => start("discord", false)} />
      ) : !options ? (
        <div className="flex h-12 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ProviderButton provider="discord" label={t("loginWithDiscord")} pending={pending === "discord"} disabled={busy} onClick={() => start("discord", false)} />
          {options.twitterOauth && (
            <ProviderButton provider="twitter" label={t("loginWithX")} pending={pending === "twitter"} disabled={busy} onClick={() => start("twitter", false)} />
          )}
          {options.passkey && (
            <Button size="lg" variant="outline" className="w-full font-semibold" disabled={busy} onClick={handlePasskey}>
              {passkeyPending ? <Loader2 className="size-5 animate-spin" /> : <KeyRound className="size-5" />}
              {t("loginWithPasskey")}
            </Button>
          )}
        </div>
      )}

      <Divider label={t("newHere")} />
      <Button variant="ghost" className="w-full" onClick={onSwitch} disabled={busy}>
        {t("createAccount")}
      </Button>
    </div>
  );
}

function SignUpPanel({
  callbackURL,
  onError,
  onSwitch,
}: {
  callbackURL: string;
  onError: (message: string | null) => void;
  onSwitch: () => void;
}) {
  const t = useTranslations("consent");
  const ta = useTranslations("auth");
  const { locale } = useLocale();
  const { data: options } = trpc.user.getSignInOptions.useQuery(undefined, { staleTime: Infinity });
  const { data: policies } = trpc.user.getPolicies.useQuery(undefined, { staleTime: Infinity });
  const { pending, start } = useSocialSignIn(callbackURL, onError);
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [policyOpen, setPolicyOpen] = useState<"tos" | "privacy" | null>(null);
  const [hasInvite] = useState(hasPendingInviteCookie);
  const game = useGame();
  const cnMode = isGameCnExclusive(game);

  const signup = options?.signup;
  const blockedByInvite = !!signup?.inviteRequired && !hasInvite;
  const canProceed = tosChecked && privacyChecked && !!signup?.signupEnabled && !blockedByInvite && pending === null;

  const handleSignUp = (provider: SocialProvider) => {
    onError(null);
    void start(provider, true);
  };

  const points = [
    t("tldr.points.0"),
    !cnMode ? t("tldr.points.1") : "你的数据将安全存储在中国大陆境内的服务器上",
    !cnMode ? t("tldr.points.2") : null,
    t("tldr.points.3"),
    !cnMode ? t("tldr.points.4") : "我们是独立工具，与 SEGA 或 华立科技 没有任何关联",
  ];

  return (
    <div className="flex flex-col gap-4">
      {signup && !signup.signupEnabled && (
        <Notice title={ta("signupDisabled")} description={ta("signupDisabledMessage")} />
      )}
      {blockedByInvite && (
        <Notice title={ta("inviteOnlyTitle")} description={ta("inviteOnlyMessage")} />
      )}

      <div className="rounded-xl border border-border bg-primary/[0.03] p-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-primary/60">{t("tldr.title")}</h3>
        <ul className="space-y-2 text-xs text-foreground/65">
          {points.filter((p): p is string => p !== null).map((point) => (
            <li key={point} className="flex items-start gap-1">
              <Dot className="shrink-0 text-primary" size={16} strokeWidth={3} fill="true" />
              <span>{point}</span>
            </li>
          ))}
          {locale === "zh-CN" && (
            <li className="flex items-start gap-1">
              <Dot className="shrink-0 text-primary" size={16} strokeWidth={3} fill="true" />
              {cnMode ? (
                <span>支持华立科技舞萌之覆盖地区<br />原则上仅限中国大陆地区访问</span>
              ) : game.regions.includes("cn") ? (
                <span>支持 maimai 日本版及国际版、以及华立科技舞萌之覆盖地区<br /><span className="underline">本站为境外站点，中国大陆地区访问速度可能较慢且不稳定</span>，境内版 tomomai.cn 正在建设中</span>
              ) : (
                <span>支持 maimai 日本版及国际版覆盖地区<br />原则上暂不支持中国大陆地区访问</span>
              )}
            </li>
          )}
          {cnMode && (
            <li className="flex items-start gap-1">
              <Dot className="shrink-0 text-primary" size={16} strokeWidth={3} fill="true" />
              <span>国内版 tomomai (同萌) 目前处于内测阶段，部分功能可能与国际版存在差异</span>
            </li>
          )}
        </ul>
      </div>

      <div className="space-y-2">
        {([
          ["tos", tosChecked, setTosChecked, t("agreeToTos")],
          ["privacy", privacyChecked, setPrivacyChecked, t("agreeToPrivacy")],
        ] as const).map(([doc, checked, setChecked, label]) => (
          <div key={doc} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
            <Checkbox
              id={`auth-consent-${doc}`}
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
            />
            <label htmlFor={`auth-consent-${doc}`} className="flex-1 cursor-pointer select-none text-sm font-semibold">
              {label}
            </label>
            <Button variant="ghost" size="sm" className="h-7 px-2" disabled={!policies} onClick={() => setPolicyOpen(doc)}>
              {t("viewFullText")}
            </Button>
          </div>
        ))}
      </div>

      {cnMode && (
        <p className="text-2xs">国内版虽然也叫 tomomai，但你可以叫它「同萌」——取其「同我萌 (to-mo-mai)」之意</p>
      )}

      <Divider label={t("agree")} />

      {cnMode ? (
        <ProviderButton provider="qq" label="以 QQ 注册" pending={pending === "discord"} disabled={!canProceed} onClick={() => handleSignUp("discord")} />
      ) : (
        <div className="flex flex-col gap-2">
          <ProviderButton provider="discord" label={ta("signupWithDiscord")} pending={pending === "discord"} disabled={!canProceed} onClick={() => handleSignUp("discord")} />
          {options?.twitterOauth && (
            <ProviderButton provider="twitter" label={ta("signupWithX")} pending={pending === "twitter"} disabled={!canProceed} onClick={() => handleSignUp("twitter")} />
          )}
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {ta("haveAccount")}{" "}
        <Button variant="link" size="sm" className="h-auto px-1 py-0" onClick={onSwitch} disabled={pending !== null}>
          {ta("signIn")}
        </Button>
      </p>

      <PolicyDialog
        open={policyOpen === "tos"}
        onOpenChange={(open) => setPolicyOpen(open ? "tos" : null)}
        title="Terms of Service"
        content={policies?.tos.content ?? ""}
      />
      <PolicyDialog
        open={policyOpen === "privacy"}
        onOpenChange={(open) => setPolicyOpen(open ? "privacy" : null)}
        title="Privacy Policy"
        content={policies?.privacy.content ?? ""}
      />
    </div>
  );
}

export function AuthDialog({ open, onOpenChange, mode, onModeChange, error, onErrorChange, callbackURL }: AuthDialogProps) {
  const t = useTranslations("auth");

  const switchTo = (next: AuthDialogMode) => {
    onErrorChange(null);
    onModeChange(next);
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="sm:max-w-md"
        style={{ backgroundImage: "linear-gradient(160deg, color-mix(in srgb, var(--primary) 18%, transparent), transparent 22%)" }}
      >
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{mode === "signin" ? t("signInTitle") : t("signUpTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {mode === "signin" ? t("signInDescription") : t("signUpDescription")}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <AutoHeight deps={[mode, error]}>
          <div className="flex flex-col gap-4 pt-1">
            {error && <ErrorBanner message={error} />}
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, x: mode === "signup" ? 12 : -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "signup" ? -12 : 12 }}
                transition={getTransition({ duration: 0.18 })}
              >
                {mode === "signin" ? (
                  <SignInPanel callbackURL={callbackURL} onError={onErrorChange} onSwitch={() => switchTo("signup")} />
                ) : (
                  <SignUpPanel callbackURL={callbackURL} onError={onErrorChange} onSwitch={() => switchTo("signin")} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </AutoHeight>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
