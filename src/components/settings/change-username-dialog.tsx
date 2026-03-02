"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/dialog-friendly";
import { trpc } from "@/lib/trpc-client";
import { toast } from "sonner";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

interface ChangeUsernameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUsername?: string;
  onSuccess: () => void;
}

export function ChangeUsernameDialog({ open, onOpenChange, currentUsername, onSuccess }: ChangeUsernameDialogProps) {
  const t = useTranslations("usernameSetup");
  const tc = useTranslations("common");
  const [username, setUsername] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [availability, setAvailability] = useState<{ available?: boolean; error?: string }>({});

  const setUsernameMutation = trpc.username.setUsername.useMutation({
    onSuccess: () => {
      toast.success(t("changeSuccess"));
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const checkAvailability = trpc.username.checkUsernameAvailability.useQuery(
    { username },
    { enabled: username.length > 0 && username !== currentUsername, refetchOnWindowFocus: false }
  );

  useEffect(() => {
    if (!open) {
      setUsername("");
      setAvailability({});
    }
  }, [open]);

  useEffect(() => {
    if (checkAvailability.data) {
      setAvailability(checkAvailability.data);
      setIsChecking(false);
    } else if (checkAvailability.error) {
      setAvailability({ available: false, error: checkAvailability.error.message });
      setIsChecking(false);
    } else if (checkAvailability.isLoading && username.length > 0) {
      setIsChecking(true);
    }
  }, [checkAvailability.data, checkAvailability.error, checkAvailability.isLoading, username]);

  const handleUsernameChange = (value: string) => {
    setUsername(value);
    setIsChecking(value.length > 0 && value !== currentUsername);
    setAvailability({});
  };

  const isSameAsCurrent = username === currentUsername;
  const isAvailable = isSameAsCurrent ? false : availability.available === true;

  const getAvailabilityIcon = () => {
    if (username.length === 0) return null;
    if (isSameAsCurrent) return <XCircle className="h-4 w-4 text-muted-foreground" />;
    if (isChecking) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    if (availability.available === true) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (availability.available === false) return <XCircle className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getAvailabilityMessage = () => {
    if (username.length === 0) return null;
    if (isSameAsCurrent) return <span className="text-sm text-muted-foreground">{t("sameAsCurrent")}</span>;
    if (isChecking) return <span className="text-sm text-muted-foreground">{t("checking")}</span>;
    if (availability.available === true) return <span className="text-sm text-green-600">{t("available")}</span>;
    if (availability.error) return <span className="text-sm text-red-600">{availability.error}</span>;
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !isAvailable) return;
    setUsernameMutation.mutate({ username: username.trim() });
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t("changeTitle")}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>{t("changeDescription")}</ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-username">{t("newUsernameLabel")}</Label>
            <div className="relative">
              <Input
                id="new-username"
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={currentUsername}
                className="pr-10"
                maxLength={32}
                autoComplete="off"
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {getAvailabilityIcon()}
              </div>
            </div>
            <div>{getAvailabilityMessage()}</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• {t("rules.characters")}</p>
              {username && !isSameAsCurrent && (
                <p>• {t("newProfileUrl", { username })}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!username.trim() || !isAvailable || isChecking || setUsernameMutation.isPending}
            >
              {setUsernameMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("changingUsername")}</>
              ) : (
                t("changeTitle")
              )}
            </Button>
          </div>
        </form>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
