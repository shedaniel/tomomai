"use client";

import { Button } from "@tomomai/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tomomai/ui";
import { signIn, useSession } from "@/lib/auth-client";
import { AuthErrorHandler } from "@/components/auth-error-handler";
import { trpc } from "@/lib/trpc-client";
import { AlertCircle, Database, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

interface InviteInfo {
  id: string;
  createdBy: string;
  createdByName: string | null;
  createdAt: Date;
  expiresAt: Date;
}

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const { data: session, isPending } = useSession();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteCode = params.code as string;

  // Use tRPC for invitation validation
  const {
    data: validateResult,
    isLoading: isValidatingInvite,
    error: validateError
  } = trpc.user.validateInvite.useQuery(
    {
      code: inviteCode,
      userId: session?.user?.id
    },
    {
      enabled: SIGNUP_TYPE === 'invite-only' && !!inviteCode,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );

  useEffect(() => {
    // If invites are not enabled, redirect to home
    if (SIGNUP_TYPE !== 'invite-only') {
      router.push('/');
      return;
    }

    if (validateResult) {
      if (validateResult.valid && validateResult.invite) {
        setInviteInfo(validateResult.invite);
        setInviteError(null);
      } else {
        setInviteError(validateResult.error || 'Invalid invitation');
        setInviteInfo(null);
        // Redirect to home after a short delay for invalid invites
        setTimeout(() => router.push('/'), 3000);
      }
    }
  }, [validateResult, router]);

  useEffect(() => {
    if (validateError) {
      setInviteError(validateError.message || 'Failed to validate invitation');
      setInviteInfo(null);
      // Redirect to home after a short delay for errors
      setTimeout(() => router.push('/'), 3000);
    }
  }, [validateError, router]);

  // If user is already logged in and has a valid invite, redirect to dashboard
  useEffect(() => {
    if (session && inviteInfo) {
      toast.success(t('acceptInvitation.alreadyLoggedIn'));
      router.push('/');
    }
  }, [session, inviteInfo, router]);

  const handleSignUp = async () => {
    try {
      // Store invitation code in a cookie so it can be accessed during OAuth flow
      document.cookie = `pendingInviteCode=${inviteCode}; path=/; max-age=600; SameSite=Lax`;

      await signIn.social({
        provider: "discord",
        callbackURL: "/",
        errorCallbackURL: `/accept/${inviteCode}`,
      });
    } catch (error) {
      console.error("Discord auth error:", error);
      toast.error(t('acceptInvitation.authError'));
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh]">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md mt-8 px-4">
      <AuthErrorHandler />
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center space-x-2">
            <Database className="h-6 w-6" />
            <span>{t('acceptInvitation.title')}</span>
          </CardTitle>
          <CardDescription>
            {t('acceptInvitation.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invitation Status */}
          <div className="space-y-3">
            {isValidatingInvite ? (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded-md text-sm">
                <div className="flex items-center space-x-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
                  <span>{t('acceptInvitation.validating')}</span>
                </div>
              </div>
            ) : inviteError ? (
              <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded-md text-sm">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{inviteError}</span>
                </div>
                <p className="mt-2 text-xs">{t('acceptInvitation.redirecting')}</p>
              </div>
            ) : inviteInfo ? (
              <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-2 rounded-md text-sm">
                <div className="flex items-center space-x-2 mb-2">
                  <UserCheck className="h-4 w-4" />
                  <span className="font-medium">{t('acceptInvitation.invited')}</span>
                </div>
                <div className="space-y-1 text-xs">
                  <p>{t('acceptInvitation.invitedBy', { name: inviteInfo.createdByName || 'Unknown' })}</p>
                  <p>{t('acceptInvitation.expiresOn', { date: formatDate(inviteInfo.expiresAt.toISOString()) })}</p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Action Buttons */}
          {inviteInfo && !session && (
            <div className="space-y-4">
              <div className="text-center">
                <Button
                  onClick={handleSignUp}
                  className="w-full"
                  size="lg"
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.195.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  {t('acceptInvitation.acceptAndSignUp')}
                </Button>
              </div>
            </div>
          )}

          {/* Features List */}
          <div className="bg-muted/50 p-3 rounded-md text-xs text-muted-foreground">
            <p className="font-medium mb-1">{t('auth.features.title')}</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>{t('auth.features.trackScores')}</li>
              <li>{t('auth.features.viewHistory')}</li>
              <li>{t('auth.features.importData')}</li>
              <li>{t('auth.features.analyzeProgress')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
