"use client";

import { Button } from "@tomomai/ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@tomomai/ui";
import { useSession } from "@/lib/auth-client";
import { useAuthDialog } from "@/components/auth/auth-dialog-provider";
import { trpc } from "@/lib/trpc-client";
import { AlertCircle, Database, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
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
  const { openAuthDialog } = useAuthDialog();
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

  const handleSignUp = () => {
    // Read by the user.create hook in lib/auth.ts during the OAuth callback.
    document.cookie = `pendingInviteCode=${inviteCode}; path=/; max-age=600; SameSite=Lax`;
    openAuthDialog({ mode: "signup", callbackURL: "/" });
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
