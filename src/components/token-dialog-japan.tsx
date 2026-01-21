"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eye, EyeOff, Key, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { AnimatedDialogContent } from "./ui/animated-dialog";

interface TokenDialogJapanProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

export function TokenDialogJapan({
  isOpen,
  onOpenChange,
  onTokenUpdate,
}: TokenDialogJapanProps) {
  const t = useTranslations();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) return;

    const finalToken = `account://${username.trim()}:://${password.trim()}`;

    setIsSubmitting(true);
    try {
      await onTokenUpdate(finalToken);
      // Clear form after successful update
      setUsername("");
      setPassword("");
      onOpenChange(false);
    } catch (error) {
      console.error("Token update error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = username.trim().length > 0 && password.trim().length > 0 && !isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <AnimatedDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>{t('tokenDialog.title')}</span>
          </DialogTitle>
          <DialogDescription>
            {t('tokenDialog.japanDescription')} {t('tokenDialog.credentialsStored')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">{t('tokenDialog.username')}</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('tokenDialog.usernamePlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t('tokenDialog.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('tokenDialog.passwordPlaceholder')}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-md text-xs text-muted-foreground">
              <p className="font-medium mb-1">
                {t('tokenDialog.authenticationNote')}
              </p>
              <p>{t('tokenDialog.segaCredentialsNote')}</p>
              <p>{t('tokenDialog.credentialsSecureNote')}</p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent mr-2" />
                  {t('tokenDialog.savingCredentials')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('tokenDialog.saveCredentials')}
                </>
              )}
            </Button>
          </form>
        </div>
      </AnimatedDialogContent>
    </Dialog>
  );
}
