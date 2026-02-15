"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AnimatedDialog, AnimatedDialogContent } from '@/components/ui/animated-dialog';
import { trpc } from '@/lib/trpc-client';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface UsernameSetupDialogProps {
  open: boolean;
  onComplete: () => void;
}

export function UsernameSetupDialog({ open, onComplete }: UsernameSetupDialogProps) {
  const t = useTranslations();
  const [username, setUsername] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [availability, setAvailability] = useState<{
    available?: boolean;
    error?: string;
  }>({});

  // Get suggested username
  const { data: suggestedData } = trpc.user.getSuggestedUsername.useQuery(
    undefined,
    { enabled: open }
  );

  // Set/update username mutation
  const setUsernameMutation = trpc.user.setUsername.useMutation({
    onSuccess: () => {
      toast.success(t('usernameSetup.success'));
      onComplete();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Check username availability mutation
  const checkAvailability = trpc.user.checkUsernameAvailability.useQuery(
    { username },
    {
      enabled: username.length > 0,
      refetchOnWindowFocus: false,
    }
  );

  // Update availability state when check completes
  useEffect(() => {
    if (checkAvailability.data) {
      setAvailability(checkAvailability.data);
      setIsChecking(false);
    } else if (checkAvailability.error) {
      setAvailability({
        available: false,
        error: checkAvailability.error.message,
      });
      setIsChecking(false);
    } else if (checkAvailability.isLoading && username.length > 0) {
      setIsChecking(true);
    }
  }, [checkAvailability.data, checkAvailability.error, checkAvailability.isLoading, username]);

  // Set suggested username when data loads
  useEffect(() => {
    if (suggestedData?.suggestedUsername && !username) {
      setUsername(suggestedData.suggestedUsername);
    }
  }, [suggestedData, username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      toast.error(t('usernameSetup.enterUsername'));
      return;
    }

    if (!availability.available) {
      toast.error(t('usernameSetup.chooseAvailable'));
      return;
    }

    setUsernameMutation.mutate({ username: username.trim() });
  };

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setIsChecking(value.length > 0);
    setAvailability({});
  };

  const getAvailabilityIcon = () => {
    if (username.length === 0) return null;
    if (isChecking) return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    if (availability.available === true) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (availability.available === false) return <XCircle className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getAvailabilityMessage = () => {
    if (username.length === 0) return null;
    if (isChecking) return <span className="text-sm text-gray-500">{t('usernameSetup.checking')}</span>;
    if (availability.available === true) return <span className="text-sm text-green-600">{t('usernameSetup.available')}</span>;
    if (availability.error) return <span className="text-sm text-red-600">{availability.error}</span>;
    return null;
  };

  return (
    <AnimatedDialog open={open} onOpenChange={() => { }}>
      <AnimatedDialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{t('usernameSetup.title')}</DialogTitle>
          <DialogDescription>
            {t('usernameSetup.description')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t('usernameSetup.usernameLabel')}</Label>
            <div className="relative">
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={t('usernameSetup.placeholder')}
                className="pr-10"
                maxLength={32}
                autoComplete="off"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getAvailabilityIcon()}
              </div>
            </div>
            <div className="mb-2">{getAvailabilityMessage()}</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• {t('usernameSetup.rules.length')}</p>
              <p>• {t('usernameSetup.rules.characters')}</p>
              <p>• {t('usernameSetup.rules.profileUrl', { username })}</p>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="submit"
              disabled={
                !username.trim() ||
                !availability.available ||
                isChecking ||
                setUsernameMutation.isPending
              }
            >
              {setUsernameMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('usernameSetup.settingUsername')}
                </>
              ) : (
                t('usernameSetup.setUsername')
              )}
            </Button>
          </div>
        </form>
      </AnimatedDialogContent>
    </AnimatedDialog>
  );
}
