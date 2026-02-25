"use client";

import { Button } from "@/components/ui/button";
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AnimatedDialog, AnimatedDialogContent } from "@/components/ui/animated-dialog";
import { Card } from "@/components/ui/card";
import { Plus, Copy, X, Users, Clock } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc-client";
import { useTranslations } from "next-intl";

const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

interface Invite {
  id: string;
  code: string;
  createdAt: Date;
  claimedAt: Date | null;
  claimedBy: string | null;
  claimedByName: string | null;
  expiresAt: Date;
  revoked: boolean;
}

interface InvitesDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InvitesDialog({ isOpen, onOpenChange }: InvitesDialogProps) {
  const t = useTranslations();

  // Only show dialog if invite system is enabled
  if (SIGNUP_TYPE !== 'invite-only') {
    return null;
  }

  // tRPC hooks
  const {
    data: inviteData,
    isLoading,
    refetch: refetchInvites
  } = trpc.user.getInvites.useQuery(undefined, {
    enabled: isOpen, // Only fetch when dialog is open
    refetchOnWindowFocus: false,
  });

  const createInviteMutation = trpc.user.createInvite.useMutation({
    onSuccess: async (data) => {
      toast.success(t('invites.messages.created'));

      // Copy invite URL to clipboard
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(data.inviteUrl);
        toast.success(t('invites.messages.linkCopied'));
      }

      // Refresh invites list
      refetchInvites();
    },
    onError: (error) => {
      toast.error(error.message || t('invites.messages.createFailed'));
    },
  });

  const revokeInviteMutation = trpc.user.revokeInvite.useMutation({
    onSuccess: () => {
      toast.success(t('invites.messages.revoked'));
      refetchInvites();
    },
    onError: (error) => {
      toast.error(error.message || t('invites.messages.revokeFailed'));
    },
  });

  const createInvite = async () => {
    createInviteMutation.mutate();
  };

  const revokeInvite = async (inviteId: string) => {
    revokeInviteMutation.mutate({ inviteId });
  };

  const copyInviteLink = async (code: string) => {
    const inviteUrl = `${window.location.origin}/accept/${code}`;
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(inviteUrl);
        toast.success(t('invites.messages.linkCopied'));
      } catch {
        toast.error(t('invites.messages.copyFailed'));
      }
    } else {
      toast.error(t('invites.messages.clipboardNotSupported'));
    }
  };

  const getInviteStatus = (invite: Invite) => {
    if (invite.revoked) return 'revoked';
    if (invite.claimedBy) return 'claimed';
    if (new Date(invite.expiresAt) <= new Date()) return 'expired';
    return 'active';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <div className="w-4 h-4 rounded-full border-2 border-blue-500" />;
      case 'claimed':
        return <div className="w-4 h-4 rounded-full bg-green-500" />;
      case 'expired':
        return <div className="w-4 h-4 rounded-full border-2 border-dashed border-gray-400" />;
      case 'revoked':
        return <div className="w-4 h-4 rounded-full bg-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-dashed border-gray-400" />;
    }
  };

  const getStatusText = (status: string, invite: Invite) => {
    switch (status) {
      case 'active':
        return t('invites.statusDetails.activeUntil', { date: format(new Date(invite.expiresAt), 'MMM dd, yyyy') });
      case 'claimed':
        return t('invites.statusDetails.claimedBy', {
          name: invite.claimedByName || 'Unknown',
          date: invite.claimedAt ? format(new Date(invite.claimedAt), 'MMM dd, yyyy') : 'Unknown'
        });
      case 'expired':
        return t('invites.statusDetails.expiredOn', { date: format(new Date(invite.expiresAt), 'MMM dd, yyyy') });
      case 'revoked':
        return t('invites.statusDetails.revoked');
      default:
        return t('invites.statusDetails.unknownStatus');
    }
  };

  const renderQuotaCircles = () => {
    if (!inviteData) return null;

    const circles = [];
    for (let i = 0; i < inviteData.quota.total; i++) {
      if (i < inviteData.quota.activeCount) {
        // Active invite
        circles.push(
          <div key={i} className="w-4 h-4 rounded-full border-2 border-blue-500" title={t('invites.quotaExplanation.active')} />
        );
      } else if (i < inviteData.quota.used) {
        // Recently claimed
        circles.push(
          <div key={i} className="w-4 h-4 rounded-full bg-green-500" title={t('invites.quotaExplanation.claimed')} />
        );
      } else {
        // Available slot
        circles.push(
          <div key={i} className="w-4 h-4 rounded-full border-2 border-dashed border-gray-400" title={t('invites.quotaExplanation.available')} />
        );
      }
    }
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-muted-foreground">{t('invites.quota')}</span>
        <div className="flex space-x-1">{circles}</div>
        <span className="text-sm text-muted-foreground">
          {inviteData.quota.used}/{inviteData.quota.total}
        </span>
      </div>
    );
  };

  return (
    <AnimatedDialog open={isOpen} onOpenChange={onOpenChange}>
      <AnimatedDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('invites.title')}
          </DialogTitle>
          <DialogDescription>
            {t('invites.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Quota Display */}
          {inviteData && (
            <div className="space-y-3">
              {renderQuotaCircles()}
              <div className="text-xs text-muted-foreground">
                • {t('invites.quotaExplanation.available')}<br />
                • {t('invites.quotaExplanation.active')}<br />
                • {t('invites.quotaExplanation.claimed')}
              </div>
            </div>
          )}

          {/* Create New Invite */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">{t('invites.yourInvitations')}</h3>
              <Button
                onClick={createInvite}
                disabled={createInviteMutation.isPending || !inviteData?.quota.canCreateNew}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createInviteMutation.isPending ? t('invites.creating') : t('invites.createInvite')}
              </Button>
            </div>

            {/* Show age restriction message for new users */}
            {inviteData?.userAge.isNewUser && (
              <div className="text-sm text-muted-foreground bg-gray-200/50 p-3 rounded-md">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="font-medium">{t('invites.messages.newUserRestriction')}</span>
                </div>
                <div className="text-xs">
                  {t('invites.messages.newUserRestrictionDetails', {
                    date: format(new Date(inviteData.userAge.canCreateAfter), 'MMM dd, yyyy')
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Invites List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              <span className="ml-2">{t('invites.loading')}</span>
            </div>
          ) : inviteData?.invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('invites.noInvitations')}
            </div>
          ) : (
            <div className="space-y-3">
              {inviteData?.invites.map((invite) => {
                const status = getInviteStatus(invite);
                return (
                  <Card key={invite.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(status)}
                        <div>
                          <div className="text-sm font-medium">
                            {status === 'active' ? t('invites.status.activeCode') :
                              status === 'claimed' ? t('invites.status.claimedCode') :
                                status === 'expired' ? t('invites.status.expiredCode') : t('invites.status.revokedCode')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {getStatusText(status, invite)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {status === 'active' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyInviteLink(invite.code)}
                            >
                              <Copy className="h-4 w-4 mr-1" />
                              {t('invites.actions.copyLink')}
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => revokeInvite(invite.id)}
                              disabled={revokeInviteMutation.isPending}
                            >
                              <X className="h-4 w-4 mr-1" />
                              {revokeInviteMutation.isPending ? t('invites.actions.revoking') : t('invites.actions.revoke')}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
