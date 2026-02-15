"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "./locale-switcher";
import { signIn } from "@/lib/auth-client";
import { toast } from "sonner";
import Link from "next/link";
import { isChinaRegion } from "@/lib/enabled-regions";
import { motion } from "motion/react";
import { STAGGER, getTransition } from "@/lib/animation-constants";
import { ConsentDialog } from "@/components/consent-dialog";
import { trpc } from "@/lib/trpc-client";

interface SignupRequirements {
  signupEnabled: boolean;
  inviteRequired: boolean;
  reason: 'disabled' | 'invite-only' | 'enabled' | 'open';
}

interface LoginScreenProps {
  signupRequirements: SignupRequirements;
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

export function LoginScreen({ signupRequirements }: LoginScreenProps) {
  const t = useTranslations();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const { data: policies } = trpc.user.getPolicies.useQuery();

  const handleAuth = (signUp: boolean) => async () => {
    try {
      await signIn.social({
        provider: "discord",
        callbackURL: "/",
        errorCallbackURL: "/",
        requestSignUp: signUp,
      });
    } catch (error) {
      console.error("Discord auth error:", error);
      toast.error("An error occurred during authentication. Please try again.");
    }
  };

  const handleSignupClick = () => {
    // Show consent dialog BEFORE OAuth
    setShowConsentDialog(true);
  };

  const handleConsentGiven = async () => {
    setShowConsentDialog(false);
    // NOW trigger OAuth signup
    await handleAuth(true)();
  };

  const handleConsentCancel = () => {
    setShowConsentDialog(false);
    // User remains on login screen
  };

  return (
    <div className="container mx-auto max-w-md px-4">
      <div className="flex justify-between py-4 *:w-fit items-center">
        <Image src="/icon.webp" alt="tomomai" width={4320} height={1080} className="h-10 w-auto dark:hidden" style={{ aspectRatio: '4320 / 1080' }} />
        <Image src="/icon-dark.webp" alt="tomomai" width={4320} height={1080} className="h-10 w-auto hidden dark:block" style={{ aspectRatio: '4320 / 1080' }} />
        {!isChinaRegion() && <LocaleSwitcher forceVisible />}
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
              <Database className="h-6 w-6" />
              <h1>{t('dashboard.title')}</h1>
            </CardTitle>
            <CardDescription>
              {t('dashboard.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground text-balance">
                {t('auth.loginDescription')}
              </p>

              <div className="text-center space-y-2">
                <Button
                  onClick={handleAuth(false)}
                  className="w-full"
                  size="lg"
                >
                  {!isChinaRegion() ? (
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.195.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
                    </svg>
                  )}
                  {!isChinaRegion() ? t('auth.loginWithDiscord') : '以 QQ 继续'}
                </Button>

                <p className="text-sm text-muted-foreground">
                  {t('auth.noAccount')}{" "}
                  <Button
                    variant="link"
                    size="sm"
                    onClick={handleSignupClick}
                    disabled={!signupRequirements.signupEnabled}
                  >
                    {!isChinaRegion() ? t('auth.signupWithDiscord') : '用 QQ 注册'}
                  </Button>
                </p>
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
                  {!isChinaRegion() ? t('auth.features.trackScores') : '追踪華立国服的成绩'}
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
                  {!isChinaRegion() ? t('auth.features.importData') : '从 舞萌 DX NET 导入数据'}
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

      {/* Consent dialog */}
      {policies && (
        <ConsentDialog
          open={showConsentDialog}
          tosContent={policies.tos.content}
          privacyContent={policies.privacy.content}
          onConsent={handleConsentGiven}
          onCancel={handleConsentCancel}
        />
      )}
    </div>
  );
}
