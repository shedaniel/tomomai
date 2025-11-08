"use client";

import { AboutDialog } from "@/components/about-dialog";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/ui/discord-icon";
import { Info, LogIn, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { LocaleSwitcher } from "./locale-switcher";

const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID;

interface PublicHeaderProps {
  profileUsername: string;
}

export function PublicHeader({}: PublicHeaderProps) {
  const t = useTranslations();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(true);
  
  const handleLogin = () => {
    // Redirect to login page
    window.location.href = '/';
  };
  
  const handleDiscordInvite = async () => {
    try {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${APPLICATION_ID}`;
      window.open(inviteUrl, '_blank');
    } catch (error) {
      console.error('Failed to open invite link:', error);
      toast.error("Failed to open invite link");
    }
  };
  
  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-1">
          <div className="whitespace-nowrap pr-2">
            <h1 className="text-lg leading-none font-semibold md:hidden">ともマイ</h1>
            <h1 className="text-lg leading-none font-semibold max-md:hidden">{t('common.title')}</h1>
            <p className="text-muted-foreground text-xs">by shedaniel</p>
          </div>
          <Button
            onClick={() => setAboutOpen(true)}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-200 max-sm:hidden"
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button
            onClick={handleDiscordInvite}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-gray-200 max-sm:hidden"
          >
            <DiscordIcon className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center space-x-4">
          <LocaleSwitcher />
          <Button onClick={handleLogin} variant="default">
            <LogIn className="mr-1 h-4 w-4" />
            {t('common.join')}
          </Button>
        </div>
      </div>
      
      {showBanner && (
        <div className="mb-6 relative bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4">
          <button
            onClick={() => setShowBanner(false)}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <DiscordIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                {t('publicHeader.discordBanner')}
              </p>
              <a
                href="https://discord.gg/jZqQHr3UDq"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline"
              >
                <span>Discord</span>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}
      
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
} 