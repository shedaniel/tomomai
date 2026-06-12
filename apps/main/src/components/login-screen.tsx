"use client";

import { useState } from "react";
import { Button } from "@tomomai/ui";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tomomai/ui";
import { Database, ArrowRight, UserRound, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { signIn, authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import Link from "next/link";
import { isCNExclusive } from "@/lib/enabled-regions";
import { motion } from "motion/react";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { ConsentDialog } from "@/components/consent-dialog";
import { MinigameCards } from "@/components/minigame-cards";
import { trpc } from "@/lib/trpc-client";
import { DiscordIcon, XIcon } from "@tomomai/ui";
import { showMessage } from "@/components/imperative-dialog";

interface SignupRequirements {
  signupEnabled: boolean;
  inviteRequired: boolean;
  reason: 'disabled' | 'invite-only' | 'enabled' | 'open';
}

interface LoginScreenProps {
  signupRequirements: SignupRequirements;
  flags: { passkey: boolean; twitterOauth: boolean };
}

function DatabaseCard() {
  const t = useTranslations();

  return (
    <Link href="/db" className="block mb-4 group cursor-pointer">
      <motion.div
        className="relative bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg p-3 sm:p-4 transition-all"
        whileHover={{ y: -1, boxShadow: '0 10px 20px rgba(0, 0, 0, 0.1)', scale: 1.02 }}
        transition={getTransition({ duration: 0.2 })}
      >
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-orange-700 dark:text-orange-100 font-medium">
              {t('db.callout.title')}
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
              {t('db.callout.subtitle')}
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-0.5">
              {t('db.callout.description')}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-orange-400 group-hover:text-orange-600 dark:text-orange-500 dark:group-hover:text-orange-300 transition-colors" />
        </div>
      </motion.div>
    </Link>
  );
}

export function LoginScreen({ signupRequirements, flags }: LoginScreenProps) {
  const t = useTranslations();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const { data: policies } = trpc.user.getPolicies.useQuery();

  const handleSocialLogin = (provider: "discord" | "twitter") => async () => {
    try {
      await signIn.social({
        provider,
        callbackURL: "/",
        errorCallbackURL: "/",
        requestSignUp: false,
      });
    } catch (error) {
      console.error(`${provider} auth error:`, error);
      toast.error("An error occurred during authentication. Please try again.");
    }
  };

  const handlePasskeyLogin = async () => {
    const showError = (description: string) =>
      showMessage({
        title: t("auth.passkey.errorTitle"),
        description,
        label: t("common.ok"),
        dedupKey: "passkey-signin-error",
      });

    try {
      const result = await authClient.signIn.passkey();
      if (result?.error) {
        // User-cancellation is intentional silence — no dialog.
        const errCode = (result.error as { code?: string }).code;
        if (errCode === "AUTH_CANCELLED") return;
        await showError(result.error.message ?? t("auth.passkey.errorGeneric"));
        return;
      }
      window.location.reload();
    } catch (error) {
      console.error("Passkey sign-in error:", error);
      await showError(t("auth.passkey.errorGeneric"));
    }
  };

  const handleSignupClick = () => {
    setShowConsentDialog(true);
  };

  const handleConsentGiven = async (method: "discord" | "twitter") => {
    setShowConsentDialog(false);
    try {
      await signIn.social({
        provider: method,
        callbackURL: "/",
        errorCallbackURL: "/",
        requestSignUp: true,
      });
    } catch (error) {
      console.error(`${method} signup error:`, error);
      toast.error("An error occurred during authentication. Please try again.");
    }
  };

  const handleConsentCancel = () => {
    setShowConsentDialog(false);
  };

  const cnMode = isCNExclusive();

  return (
    <div className="container mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-8">
      <div className="flex justify-between py-4 *:w-fit items-center">
        <Image src="/icon.webp" alt="tomomai" width={4320} height={1080} className="h-10 w-auto dark:hidden" style={{ aspectRatio: '4320 / 1080' }} />
        <Image src="/icon-dark.webp" alt="tomomai" width={4320} height={1080} className="h-10 w-auto hidden dark:block" style={{ aspectRatio: '4320 / 1080' }} />
        {!cnMode && <LocaleSwitcher forceVisible />}
      </div>
      <DatabaseCard />
      <motion.div
        initial={{ opacity: 0.4, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={getTransition({ duration: 0.5, ease: [0.4, 0, 0.2, 1] })}
      >
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center space-x-2">
              <h1>{t('dashboard.title')}</h1>
            </CardTitle>
            <CardDescription>
              {t('dashboard.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-4">
              <div className="space-y-3">
                {!cnMode && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{t('auth.signIn')}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                {cnMode ? (
                  // CN mode: single QQ button
                  <Button onClick={handleSocialLogin("discord")} className="w-full" size="lg">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
                    </svg>
                    以 QQ 继续
                  </Button>
                ) : (
                  // International mode: branded buttons (twitter + passkey flag-gated)
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSocialLogin("discord")}
                      size="lg"
                      title={t('auth.loginWithDiscord')}
                      aria-label={t('auth.loginWithDiscord')}
                      className="flex-[2] bg-indigo-500/90 hover:bg-indigo-500 text-white border border-input dark:bg-indigo-500/80 dark:hover:bg-indigo-500"
                    >
                      <DiscordIcon className="w-5 h-5" />
                    </Button>
                    {flags.twitterOauth && (
                      <Button
                        onClick={handleSocialLogin("twitter")}
                        size="lg"
                        title={t('auth.loginWithX')}
                        aria-label={t('auth.loginWithX')}
                        className="flex-[2] bg-neutral-900 hover:bg-neutral-800 text-white border border-input"
                      >
                        <XIcon className="w-5 h-5" />
                      </Button>
                    )}
                    {flags.passkey && (
                      <Button
                        onClick={handlePasskeyLogin}
                        size="lg"
                        variant="outline"
                        title={t('auth.loginWithPasskey')}
                        aria-label={t('auth.loginWithPasskey')}
                        className="flex-[1]"
                      >
                        <KeyRound className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                )}

                <div className="pt-2">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{t('auth.newHere')}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('auth.noAccount')}{" "}
                    <Button
                      variant="link"
                      size="sm"
                      onClick={handleSignupClick}
                      disabled={!signupRequirements.signupEnabled}
                    >
                      {t('auth.signup')}
                    </Button>
                  </p>
                </div>
              </div>

              {signupRequirements.reason === 'disabled' && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-3 py-2 rounded-md text-sm">
                  <p className="font-medium">{t('auth.signupDisabled')}</p>
                  <p className="text-xs mt-1">{t('auth.signupDisabledMessage')}</p>
                </div>
              )}

              {signupRequirements.reason === 'invite-only' && (
                <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md text-sm">
                  <p className="font-medium">Invitation Required</p>
                  <p className="text-xs mt-1">New signups require an invitation from an existing user.</p>
                </div>
              )}
            </div>

            <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground">
              <p className="font-medium mb-1">{t('auth.features.title')}</p>
              <ul className="space-y-1 list-disc list-inside">
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: 0.1 + 0 * STAGGER.slow })}
                >
                  {!cnMode ? t('auth.features.trackScores') : '追踪华立国服的成绩'}
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: 0.1 + 1 * STAGGER.slow })}
                >
                  {t('auth.features.viewHistory')}
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: 0.1 + 2 * STAGGER.slow })}
                >
                  {!cnMode ? t('auth.features.importData') : '从 舞萌 DX NET 导入数据'}
                </motion.li>
                <motion.li
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={getTransition({ delay: 0.1 + 3 * STAGGER.slow })}
                >
                  {t('auth.features.analyzeProgress')}
                </motion.li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={getTransition({ duration: 0.5, delay: 0.2 })}
        className="mt-4"
      >
        <MinigameCards />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={getTransition({ duration: 0.5, delay: 0.3 })}
        className="mt-4 flex justify-center"
      >
        <Link
          href="/profile/shedaniel/intl"
          className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 hover:bg-muted/60 hover:border-border px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-all"
        >
          <UserRound className="h-3.5 w-3.5 opacity-80 group-hover:opacity-100 transition-opacity" />
          <span>{t('auth.peekExampleProfile')}</span>
          <span className="font-semibold text-foreground/90 group-hover:text-foreground transition-colors">@shedaniel</span>
          <ArrowRight className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
        </Link>
      </motion.div>

      {policies && (
        <ConsentDialog
          open={showConsentDialog}
          tosContent={policies.tos.content}
          privacyContent={policies.privacy.content}
          onConsent={handleConsentGiven}
          onCancel={handleConsentCancel}
          signupEnabled={signupRequirements.signupEnabled}
          twitterOauthEnabled={flags.twitterOauth}
        />
      )}
    </div>
  );
}
