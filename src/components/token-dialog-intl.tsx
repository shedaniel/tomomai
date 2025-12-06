"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, EyeOff, Key, Save } from "lucide-react";
import { useTranslations } from "next-intl";

interface TokenDialogIntlProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

export function TokenDialogIntl({
  isOpen,
  onOpenChange,
  onTokenUpdate,
}: TokenDialogIntlProps) {
  const t = useTranslations();
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<"token" | "password">("token");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate token format: clal= followed by alphanumeric characters
  const isValidToken = (tokenValue: string) => {
    const tokenRegex = /^clal=[a-zA-Z0-9]+$/;
    return tokenRegex.test(tokenValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalToken = "";
    if (authMethod === "token") {
      if (!token.trim() || !isValidToken(token.trim())) return;
      finalToken = `cookie://${token.trim()}`;
    } else {
      if (!username.trim() || !password.trim()) return;
      finalToken = `account://${username.trim()}:://${password.trim()}`;
    }

    setIsSubmitting(true);
    try {
      await onTokenUpdate(finalToken);
      // Clear form after successful update
      setToken("");
      setUsername("");
      setPassword("");
      onOpenChange(false);
    } catch (error) {
      console.error("Token update error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = authMethod === "token" 
    ? token.trim().length > 0 && isValidToken(token.trim()) && !isSubmitting
    : username.trim().length > 0 && password.trim().length > 0 && !isSubmitting;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Key className="h-5 w-5" />
            <span>{t('tokenDialog.title')}</span>
          </DialogTitle>
          <DialogDescription>
            {t('tokenDialog.intlDescription')} {t('tokenDialog.credentialsStored')}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs className="w-full" value={authMethod} onValueChange={(value) => setAuthMethod(value as "token" | "password")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="token">{t('tokenDialog.tokenTab')}</TabsTrigger>
                <TabsTrigger value="password">{t('tokenDialog.passwordTab')}</TabsTrigger>
              </TabsList>

              <TabsContent value="token" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="token">{t('tokenDialog.cookies')}</Label>
                  <div className="relative">
                    <Input
                      id="token"
                      type="text"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder={t('tokenDialog.tokenPlaceholder')}
                      className={`${token && !isValidToken(token) ? 'border-red-500' : ''}`}
                    />
                  </div>
                  {token && !isValidToken(token) && (
                    <p className="text-xs text-red-500">
                      {t('tokenDialog.tokenValidationError')}
                    </p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="password" className="space-y-4 mt-4">
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
              </TabsContent>
            </Tabs>

            <div className="bg-muted/50 rounded-md text-xs text-muted-foreground">
              <p className="font-medium mb-1">
                {t('tokenDialog.authenticationNote')}
              </p>
              <ul className="space-y-1 list-disc list-outside pl-4">
                <li>
                  <strong>{t('tokenDialog.tokenTab')}:</strong> {t('tokenDialog.tokenInstructions.description')}
                  <p className="mb-2">{t('tokenDialog.tokenInstructions.expiration')}</p>
                  <p>For easier cookie extraction, first install this <a className="underline text-blue-600" href="/maimai-cookie-extractor.user.js" target="_blank" rel="noopener noreferrer">userscript</a> (requires Tampermonkey/Greasemonkey).</p>
                  <p>Then, <a className="underline text-blue-600" href="https://lng-tgk-aime-gw.am-all.net/common_auth/login?site_id=maimaidxex&redirect_url=https://maimaidx-eng.com/maimai-mobile/&back_url=https://maimai.sega.com/" target="_blank" rel="noopener noreferrer">visit this link</a> in incognito mode and login to aime.</p>
                  <p>Finally, <a className="underline text-blue-600" href="https://lng-tgk-aime-gw.am-all.net/common_auth" target="_blank" rel="noopener noreferrer">visit this link</a>, you will see &quot;Not Found&quot;, click the &quot;Copy maimai cookie&quot; button on top right and paste the cookie into the input field above.</p>
                </li>
                <li>
                  <strong>{t('tokenDialog.passwordTab')}:</strong> {t('tokenDialog.passwordInstructions')}
                </li>
              </ul>
              <p className="mt-2">{t('tokenDialog.secureStorage')}</p>
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
      </DialogContent>
    </Dialog>
  );
}

