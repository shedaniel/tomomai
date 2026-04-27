"use client";

import { Badge } from "@/components/ui/badge";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/dialog-friendly";
import { cn } from "@/lib/utils";
import { ChevronRight, Fish, Key, Smartphone, Snowflake, Wifi } from "lucide-react";
import { useTranslations } from "next-intl";

interface TokenDialogCnProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTokenUpdate: (token: string) => Promise<void>;
}

const FETCH_OPTIONS = [
  {
    name: "水鱼查分器",
    description: "使用您的水鱼查分器登入用户名 或 已绑定的 QQ 帐户 ID 取得资料。",
    recommended: false,
    supported: false,
    icon: <Fish className="h-5 w-5 text-primary" />
  },
  {
    name: "落雪咖啡屋查分器",
    description: "以落雪咖啡屋帐号登入授权取得资料。",
    recommended: false,
    supported: true,
    icon: <Snowflake className="h-5 w-5 text-primary" />
  },
  {
    name: "HTTP 代理",
    description: "透过 HTTP 代理拦截手机微信中的舞萌 DX 小程序请求以取得资料。",
    recommended: false,
    supported: false,
    icon: <Wifi className="h-5 w-5 text-primary" />
  },
  {
    name: "Android 应用程式",
    description: "在 Android 装置上安装本应用程式以自动取得资料。",
    recommended: false,
    supported: false,
    icon: <Smartphone className="h-5 w-5 text-primary" />
  }
] as const

export function TokenDialogCn({
  isOpen,
  onOpenChange,
  onTokenUpdate,
}: TokenDialogCnProps) {
  const t = useTranslations();

  const handleClose0 = () => {
    onOpenChange(false);
  };

  const handleClose = () => {
    // Don't close if subdialogs are open
    if (false) {
      return;
    }

    handleClose0();
  };

  return (
    <>
      {/* Main Selection Dialog */}
      <ResponsiveDialog open={isOpen} onOpenChange={handleClose}>
        <ResponsiveDialogContent className={cn("sm:max-w-md", false ? "opacity-70!" : "")}>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>{t('tokenDialog.title')}</span>
            </ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {t('tokenDialog.intlDescription')} {t('tokenDialog.credentialsStored')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-3">
            {...FETCH_OPTIONS.map(option => (
              <button
                onClick={() => { }}
                disabled={!option.supported}
                className="w-full p-4 border-2 rounded-lg hover:border-primary hover:bg-accent/50 transition-all text-left group disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-1 p-2 rounded-md bg-primary/10">
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-semibold text-base">{option.name}</span>
                      {option.recommended && (<Badge variant="default">
                        {t('tokenDialog.recommended')}
                      </Badge>)}
                      {!option.supported && (<Badge variant="secondary">
                        即将推出
                      </Badge>)}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
                </div>
              </button>
            ))}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
