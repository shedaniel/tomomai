"use client";

import { AboutDialog } from "@/components/about-dialog";
import { ThemeDialog } from "@/components/theme-dialog";
import { Button } from "@tomomai/ui";
import { DiscordIcon } from "@tomomai/ui";
import { user } from "@/lib/db/schema-pg";
import { Region, User } from "@/lib/types";
import { Beaker, Check, ChevronDown, Database, Flag, Home, Info, Languages, LogIn, LogOut, Menu, Palette, Ship, Sparkles, User as LucideUserIcon, Settings, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import { Fragment, useCallback, useState } from "react";
import { toast } from "sonner";
import { LocaleSwitcher } from "./locale-switcher";
import { RegionSwitcher } from "./region-switcher";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@tomomai/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@tomomai/ui";
import { Separator } from "@tomomai/ui";
import { motion, AnimatePresence } from "motion/react";
import { AutoHeight } from "@/components/animate-ui/primitives/effects/auto-height";
import { SPRING_CONFIGS, getTransition } from "@/lib/animation-constants";

import { triggerHaptic } from "@/lib/haptics";
import { getEnabledRegions, isCNExclusive } from "@/lib/enabled-regions";
import { Locale, setLocaleCookie } from "@/i18n/locale";
import { cn, getLanguages } from "@/lib/utils";
import { useLocale } from "./providers/locale-provider";

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg aria-label="Threads" fill="currentColor" className={className} role="img" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg" stroke="#fff">
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"></path>
    </svg>
  )
}

const APPLICATION_ID = process.env.NEXT_PUBLIC_DISCORD_APPLICATION_ID;
const SIGNUP_TYPE = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE || 'disabled';

type CurrentTab = "dashboard" | "db";
const ALL_TABS: CurrentTab[] = ["dashboard", "db"];

const TAB_ICONS: Record<CurrentTab, React.ReactNode> = {
  dashboard: <Home className="size-5" />,
  db: <Database className="size-5" />,
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
  customThemesEnabled?: boolean;
  user?: {
    user: User;
    menu: {
      userRole: typeof user.$inferSelect.role;
      selectedRegion: Region;
      onRegionChange: (region: Region) => void;
      onInvites: () => void;
      onAdmin: () => void;
      onTestOnboarding: () => void;
      onExperiments: () => void;
      onLogout: () => void;
    } | null;
  }
}

function NavbarButtons({ currentTab }: { currentTab: CurrentTab }) {
  const t = useTranslations();

  return (<>
    {ALL_TABS.filter(tab => tab !== currentTab).map(tab => (
      <Fragment key={tab}>
        <Button
          size="sm"
          className="h-10 md:hidden max-xs:w-10"
          asChild
        >
          <Link href={TAB_LINKS[tab]} className="md:hidden max-xs:rounded-full xs:px-4!">
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

function UserAvatar({ user }: { user: User }) {
  return user.image ? (
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
}

const regionIcons: Record<Region, React.ReactNode> = {
  intl: <Ship className="h-4 w-4" />,
  jp: <Flag className="h-4 w-4" />,
  cn: <Flag className="h-4 w-4" />,
};

function DrawerLocaleSwitcher({ drawerItemClass }: { drawerItemClass: string }) {
  const t = useTranslations();
  const LANGUAGES = getLanguages(t);
  const { locale, setLocale } = useLocale();
  const [expanded, setExpanded] = useState(false);

  const handleNewLocale = useCallback((value: string) => {
    const newLocale = value === "auto" ? null : value as Locale;
    if (newLocale) {
      setLocale(newLocale);
      setLocaleCookie(newLocale);
    } else {
      if (typeof document !== 'undefined') {
        document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
      }
      window.location.reload();
    }
  }, [setLocale]);

  return (
    <div className="flex flex-col">
      <button className={cn(drawerItemClass)} onClick={() => { triggerHaptic("light"); setExpanded(v => !v); }}>
        <Languages className="h-4 w-4" />
        <span className="flex-1 text-left">{t('common.language')}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <AutoHeight deps={[expanded]}>
        <div className={cn("flex flex-col", !expanded && "max-h-0")}>
          {LANGUAGES.map((language) => {
            const value = language.value || "auto";
            const isSelected = locale === (language.value || undefined);
            return (
              <button
                key={value}
                className={cn(drawerItemClass, "pl-9", isSelected && "text-primary font-medium")}
                onClick={() => { triggerHaptic("light"); handleNewLocale(value); }}
              >
                <span className="flex-1 text-left">{language.label}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </AutoHeight>
    </div>
  );
}

function DrawerRegionSwitcher({ value, onChange, drawerItemClass }: { value: Region; onChange: (region: Region) => void; drawerItemClass: string }) {
  const t = useTranslations();
  const regions = getEnabledRegions();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col">
      <button className={cn(drawerItemClass)} onClick={() => { triggerHaptic("light"); setExpanded(v => !v); }}>
        <Flag className="h-4 w-4" />
        <span className="flex-1 text-left">{t('common.region')}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      <AutoHeight deps={[expanded]}>
        <div className={cn("flex flex-col", !expanded && "max-h-0")}>
          {regions.map((region) => {
            const isSelected = value === region;
            return (
              <button
                key={region}
                className={cn(drawerItemClass, "pl-9", isSelected && "text-primary font-medium")}
                onClick={() => { triggerHaptic("light"); onChange(region); }}
              >
                {regionIcons[region]}
                <span className="flex-1 text-left">{t(`regions.${region}`)}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      </AutoHeight>
    </div>
  );
}

function UserIcon({ user, menu, onAbout, onTheme, onDiscordInvite }: Partial<NonNullable<HeaderProps['user']>> & {
  onAbout: () => void;
  onTheme: () => void;
  onDiscordInvite: () => void;
}) {
  const t = useTranslations();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const avatarButton = (
    <Button variant="outline" className="relative bg-background h-10 md:h-8 rounded-full max-md:pl-3! pr-1! gap-3 md:gap-2 focus:ring-2 focus:ring-gray-300 focus:ring-offset-2 focus:ring-offset-background data-[state=open]:ring-2 data-[state=open]:ring-gray-300 data-[state=open]:ring-offset-2 data-[state=open]:ring-offset-background">
      <Menu className="size-5 md:size-3.5 text-muted-foreground" />
      <div className="size-8 md:size-6 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
        {user?.image ? (
          <Image src={user.image} alt="Profile" width={28} height={28} className="size-8 md:size-6 rounded-full" />
        ) : (
          <LucideUserIcon className="size-3" />
        )}
      </div>
    </Button>
  );

  const drawerItemClass = "flex items-center gap-3 w-full px-2 py-2.5 max-xs:text-sm text-[15px] rounded-md hover:bg-muted transition-colors";

  return (
    <>
      <div className="md:hidden">
        <Drawer direction="right" open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerTrigger asChild>
            {avatarButton}
          </DrawerTrigger>
          <DrawerContent className="!max-w-[70dvw] !w-fit">
            <DrawerHeader className="flex flex-row items-center gap-3 border-b pb-4 mb-1">
              {user ? <UserAvatar user={user} /> : <LucideUserIcon className="h-5 w-5" />}
              <div className="flex flex-col">
                <DrawerTitle>{user ? user.name : t('common.guest')}</DrawerTitle>
                {user && <p className="text-xs text-muted-foreground">{t('userHeader.memberLabel')}</p>}
              </div>
            </DrawerHeader>
            <DrawerDescription className="sr-only">{user ? t('userHeader.memberLabel') : t('common.guest')}</DrawerDescription>
            {user && (
              <div className="border-b px-4 py-3 mb-1">
                <p className="text-sm text-muted-foreground text-balance">{t('userHeader.discordPrompt')}</p>
                <a
                  href="https://discord.gg/jZqQHr3UDq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium leading-none text-primary hover:underline"
                >
                  {t('userHeader.joinDiscord')}
                </a>
              </div>
            )}
            <div className="flex flex-col overflow-y-auto flex-1 px-2">
              {!isCNExclusive() && (
                <>
                  <DrawerLocaleSwitcher drawerItemClass={drawerItemClass} />
                  <Separator className="my-1" />
                </>
              )}
              {menu && getEnabledRegions().length > 1 && (
                <>
                  <DrawerRegionSwitcher value={menu.selectedRegion} onChange={menu.onRegionChange} drawerItemClass={drawerItemClass} />
                  <Separator className="my-1" />
                </>
              )}
              {!user && (
                <>
                  <DrawerClose asChild>
                    <Link href="/" className={drawerItemClass}>
                      <LogIn className="h-4 w-4" />
                      <span>{t('common.join')}</span>
                    </Link>
                  </DrawerClose>
                  <Separator className="my-1" />
                </>
              )}
              {menu && SIGNUP_TYPE === 'invite-only' && (
                <>
                  <DrawerClose asChild>
                    <button className={drawerItemClass} onClick={menu.onInvites}>
                      <Users className="h-4 w-4" />
                      <span>{t('common.invitations')}</span>
                    </button>
                  </DrawerClose>
                  <Separator className="my-1" />
                </>
              )}
              {menu?.userRole === "admin" && (
                <>
                  <DrawerClose asChild>
                    <button className={drawerItemClass} onClick={menu.onAdmin}>
                      <Users className="h-4 w-4" />
                      <span>{t('header.admin')}</span>
                    </button>
                  </DrawerClose>
                  <DrawerClose asChild>
                    <button className={drawerItemClass} onClick={menu.onTestOnboarding}>
                      <Sparkles className="h-4 w-4" />
                      <span>{t('header.testOnboarding')}</span>
                    </button>
                  </DrawerClose>
                  <Separator className="my-1" />
                </>
              )}
              <DrawerClose asChild>
                <button className={drawerItemClass} onClick={onAbout}>
                  <Info className="h-4 w-4" />
                  <span>{t('common.about')}</span>
                </button>
              </DrawerClose>
              <DrawerClose asChild>
                <button className={drawerItemClass} onClick={onTheme}>
                  <Palette className="h-4 w-4" />
                  <span>{t('common.theme')}</span>
                </button>
              </DrawerClose>
              <DrawerClose asChild>
                <button className={drawerItemClass} onClick={onDiscordInvite}>
                  <DiscordIcon className="h-4 w-4" />
                  <span>{t('header.addDiscordBot')}</span>
                </button>
              </DrawerClose>
              {(menu || user) && (
                <Separator className="my-1" />
              )}
              {menu && (
                <>
                  <DrawerClose asChild>
                    <button className={drawerItemClass} onClick={menu.onExperiments}>
                      <Beaker className="h-4 w-4" />
                      <span>{t('common.experiments')}</span>
                    </button>
                  </DrawerClose>
                </>
              )}
              {user && (
                <DrawerClose asChild>
                  <Link href="/settings" className={drawerItemClass}>
                    <Settings className="h-4 w-4" />
                    <span>{t('common.settings')}</span>
                  </Link>
                </DrawerClose>
              )}
              {menu && (
                <>
                  <Separator className="my-1" />
                  <DrawerClose asChild>
                    <button className={drawerItemClass} onClick={menu.onLogout}>
                      <LogOut className="h-4 w-4" />
                      <span>{t('common.logout')}</span>
                    </button>
                  </DrawerClose>
                </>
              )}
              <div className="mt-auto" />
              <Separator className="my-1" />
              <DrawerClose asChild>
                <a href="https://x.com/shedaniel_sub" target="_blank" rel="noopener noreferrer" className={drawerItemClass}>
                  <XIcon className="size-4" />
                  <span>{t('header.followTwitter')}</span>
                </a>
              </DrawerClose>
              <DrawerClose asChild>
                <a href="https://threads.com/shedaniel" target="_blank" rel="noopener noreferrer" className={cn(drawerItemClass, "mb-4")}>
                  <ThreadsIcon className="size-4" />
                  <span>{t('header.followThreads')}</span>
                </a>
              </DrawerClose>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
      <div className="hidden md:block">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            {avatarButton}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            {user ? (
              <>
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
              </>
            ) : (
              <>
                <DropdownMenuItem asChild>
                  <Link href="/">
                    <LogIn className="mr-2 h-4 w-4" />
                    <span>{t('common.join')}</span>
                  </Link>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
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
              <span>{t('header.addDiscordBot')}</span>
            </DropdownMenuItem>
            {menu && SIGNUP_TYPE === 'invite-only' && (
              <>
                <DropdownMenuItem onClick={menu.onInvites}>
                  <Users className="mr-2 h-4 w-4" />
                  <span>{t('common.invitations')}</span>
                </DropdownMenuItem>
              </>
            )}
            {menu?.userRole === "admin" && (
              <>
                <DropdownMenuItem onClick={menu.onAdmin}>
                  <Users className="mr-2 h-4 w-4" />
                  <span>{t('header.admin')}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={menu.onTestOnboarding}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <span>{t('header.testOnboarding')}</span>
                </DropdownMenuItem>
              </>
            )}
            {(menu || user) && (
              <DropdownMenuSeparator />
            )}
            {menu && (
              <DropdownMenuItem onClick={menu.onExperiments}>
                <Beaker className="mr-2 h-4 w-4" />
                <span>{t('common.experiments')}</span>
              </DropdownMenuItem>
            )}
            {user && (
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>{t('common.settings')}</span>
                </Link>
              </DropdownMenuItem>
            )}
            {menu && (
              <DropdownMenuItem onClick={menu.onLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('common.logout')}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="https://x.com/shedaniel_sub" target="_blank" rel="noopener noreferrer">
                <XIcon className="mr-2 h-3.5 w-3.5" />
                <span>{t('header.followTwitter')}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="https://threads.com/shedaniel" target="_blank" rel="noopener noreferrer">
                <ThreadsIcon className="mr-2 h-3.5 w-3.5" />
                <span>{t('header.followThreads')}</span>
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}

export function Header({ currentTab, showDiscordBanner = true, customThemesEnabled = false, user }: HeaderProps) {
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
          <NavbarButtons currentTab={currentTab} />
        </div>

        <div className="flex items-center space-x-4">
          {!isCNExclusive() && <div className="max-md:hidden"><LocaleSwitcher /></div>}
          {user?.menu && getEnabledRegions().length > 1 && <div className="max-md:hidden"><RegionSwitcher header={true} value={user.menu.selectedRegion} onChange={user.menu.onRegionChange} /></div>}
          <UserIcon user={user?.user} menu={user?.menu} onAbout={() => setAboutOpen(true)} onTheme={() => setThemeOpen(true)} onDiscordInvite={handleDiscordInvite} />
        </div>
      </div>

      <AnimatePresence>
        {showBanner && <DiscordBanner onDismiss={() => setShowBanner(false)} />}
      </AnimatePresence>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
      <ThemeDialog open={themeOpen} onOpenChange={setThemeOpen} customThemesEnabled={customThemesEnabled} />
    </>
  );
}
