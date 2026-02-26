"use client";

import { AboutDialog } from "@/components/about-dialog";
import { ThemeDialog } from "@/components/theme-dialog";
import { Button } from "@/components/ui/button";
import { DiscordIcon } from "@/components/ui/discord-icon";
import { useMediaQuery } from "@/hooks/use-media-query";
import { user } from "@/lib/db/schema-pg";
import { Region, User } from "@/lib/types";
import { Beaker, Database, Home, Info, LogIn, LogOut, Palette, User as LucideUserIcon, Settings, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { LocaleSwitcher } from "./locale-switcher";
import { RegionSwitcher } from "./region-switcher";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";
import { SPRING_CONFIGS, STAGGER, getTransition } from "@/lib/animation-constants";

import { getEnabledRegions, isChinaRegion } from "@/lib/enabled-regions";

const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID;
const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

type CurrentTab = "dashboard" | "db";
const ALL_TABS: CurrentTab[] = ["dashboard", "db"];

const TAB_ICONS: Record<CurrentTab, React.ReactNode> = {
  dashboard: <Home className="h-4 w-4" />,
  db: <Database className="h-4 w-4" />,
};

const TAB_LINKS: Record<CurrentTab, string> = {
  dashboard: "/",
  db: "/db",
};

const TAB_ICONS_PATHS: Record<CurrentTab, string> = {
  dashboard: "/icon.webp",
  db: "/icon-db.webp",
};

const TAB_ICONS_PATHS_DARK: Record<CurrentTab, string> = {
  dashboard: "/icon-dark.webp",
  db: "/icon-db-dark.webp",
};

interface HeaderProps {
  currentTab: CurrentTab;
  showDiscordBanner?: boolean;
  user?: {
    user: User;
    menu: {
      userRole: typeof user.$inferSelect.role;
      selectedRegion: Region;
      onRegionChange: (region: Region) => void;
      onInvites: () => void;
      onAdmin: () => void;
      onExperiments: () => void;
      onLogout: () => void;
    } | null;
  }
}

function NavbarButtons({ currentTab, onAbout, onTheme, onDiscordInvite }: { currentTab: CurrentTab; onAbout: () => void; onTheme: () => void; onDiscordInvite: () => void }) {
  const t = useTranslations();

  return (<>
    {ALL_TABS.filter(tab => tab !== currentTab).map(tab => (
      <Fragment key={tab}>
        <Button
          size="sm"
          className="h-8 md:hidden max-xs:w-8"
          asChild
        >
          <Link href={TAB_LINKS[tab]} className="md:hidden">
            {TAB_ICONS[tab]}
            <span className="max-xs:hidden">{t(`header.tabs.${tab}`)}</span>
          </Link>
        </Button>
        <Button
          size="sm"
          className="h-8 px-3 py-0 max-md:hidden"
          asChild
        >
          <Link href={TAB_LINKS[tab]}>
            {t(`header.tabs.${tab}`)}
          </Link>
        </Button>
      </Fragment>
    ))}
    <Button
      onClick={onAbout}
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0 hover:bg-muted md:hidden max-sm:hidden"
    >
      <Info className="h-4 w-4" />
    </Button>
    <Button
      onClick={onAbout}
      variant="ghost"
      size="sm"
      className="h-8 px-2 py-0 hover:bg-muted max-md:hidden"
    >
      {t('common.about')}
    </Button>

    <Button
      onClick={onTheme}
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0 hover:bg-muted md:hidden max-sm:hidden"
    >
      <Palette className="h-4 w-4" />
    </Button>
    <Button
      onClick={onTheme}
      variant="ghost"
      size="sm"
      className="h-8 px-2 py-0 hover:bg-muted max-md:hidden"
    >
      {t('common.theme')}
    </Button>

    <Button
      onClick={onDiscordInvite}
      variant="outline"
      size="sm"
      className="h-8 w-8 p-0 hover:bg-muted md:hidden max-sm:hidden"
    >
      <DiscordIcon className="h-4 w-4" />
    </Button>
    <Button
      onClick={onDiscordInvite}
      variant="ghost"
      size="sm"
      className="h-8 px-2 py-0 hover:bg-muted max-md:hidden"
    >
      {t('header.addDiscordBot')}
    </Button>
  </>)
}

function DiscordBanner({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations();

  return (
    <motion.div
      className="mb-6 relative bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 sm:p-4"
      initial={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={getTransition({ duration: 0.3, ease: [0.4, 0, 0.2, 1] })}
    >
      <button
        onClick={onDismiss}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <DiscordIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
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
    </motion.div>
  )
}

function UserIcon({ user, menu, onAbout, onTheme, onDiscordInvite }: NonNullable<HeaderProps['user']> & {
  onAbout: () => void;
  onTheme: () => void;
  onDiscordInvite: () => void;
}) {
  const t = useTranslations();
  const isMobile = useMediaQuery('(max-width: 640px)');

  if (!menu) return user.image ? (
    <Image
      src={user.image}
      alt="Profile"
      width={40}
      height={40}
      className="w-10 h-10 rounded-full"
    />
  ) : (
    <LucideUserIcon className="h-5 w-5" />
  );

  const { userRole, onInvites, onAdmin, onExperiments, onLogout } = menu;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-background data-[state=open]:ring-2 data-[state=open]:ring-gray-300 data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-background">
          {user.image ? (
            <Image
              src={user.image}
              alt="Profile"
              width={40}
              height={40}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <LucideUserIcon className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {t('userHeader.memberLabel')}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-xs text-muted-foreground">
              {t('userHeader.discordPrompt')}
            </p>
            <a
              href="https://discord.gg/jZqQHr3UDq"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium leading-none text-primary hover:underline text-center px-1 py-3"
            >
              {t('userHeader.joinDiscord')}
            </a>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SIGNUP_TYPE === 'invite-only' && (
          <>
            <DropdownMenuItem onClick={onInvites}>
              <Users className="mr-2 h-4 w-4" />
              <span>{t('common.invitations')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {userRole === "admin" && (
          <>
            <DropdownMenuItem onClick={onAdmin}>
              <Users className="mr-2 h-4 w-4" />
              <span>{t('header.admin')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {isMobile && (
          <>
            <DropdownMenuItem onClick={onAbout}>
              <Info className="mr-2 h-4 w-4" />
              <span>{t('common.about')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTheme}>
              <Palette className="mr-2 h-4 w-4" />
              <span>{t('common.theme')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDiscordInvite}>
              <DiscordIcon className="mr-2 h-4 w-4" />
              <span>{t('common.discord')}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={onExperiments}>
          <Beaker className="mr-2 h-4 w-4" />
          <span>{t('common.experiments')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="mr-2 h-4 w-4" />
            <span>{t('common.settings')}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>{t('common.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Header({ currentTab, showDiscordBanner = true, user }: HeaderProps) {
  const t = useTranslations();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [showBanner, setShowBanner] = useState(showDiscordBanner);

  const handleDiscordInvite = async () => {
    try {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${APPLICATION_ID}`;
      window.open(inviteUrl, '_blank');
    } catch (error) {
      console.error('Failed to open invite link:', error);
      toast.error(t('header.errors.inviteLink'));
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-1 max-md:space-x-2">
          <Link href="/">
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={getTransition(SPRING_CONFIGS.snappy)}
            >
              <Image src={TAB_ICONS_PATHS[currentTab]} alt="tomomai" width={4320} height={1080} priority className="h-11 w-auto dark:hidden" style={{ aspectRatio: '4320 / 1080' }} />
              <Image src={TAB_ICONS_PATHS_DARK[currentTab]} alt="tomomai" width={4320} height={1080} priority className="h-11 w-auto hidden dark:block" style={{ aspectRatio: '4320 / 1080' }} />
            </motion.div>
          </Link>
          <NavbarButtons currentTab={currentTab} onAbout={() => setAboutOpen(true)} onTheme={() => setThemeOpen(true)} onDiscordInvite={handleDiscordInvite} />
        </div>

        <div className="flex items-center space-x-4">
          {!isChinaRegion() && <LocaleSwitcher />}
          {user ? (<>
            {user.menu && getEnabledRegions().length > 1 && <RegionSwitcher header={true} value={user.menu.selectedRegion} onChange={user.menu.onRegionChange} />}
            <UserIcon {...user} onAbout={() => setAboutOpen(true)} onTheme={() => setThemeOpen(true)} onDiscordInvite={handleDiscordInvite} />
          </>) : (
            <Button variant="default" asChild>
              <Link href="/">
                <LogIn className="mr-1 h-4 w-4" />
                {t('common.join')}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showBanner && <DiscordBanner onDismiss={() => setShowBanner(false)} />}
      </AnimatePresence>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} />
    </>
  );
}
