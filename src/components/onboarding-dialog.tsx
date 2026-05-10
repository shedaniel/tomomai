"use client";

import { Button } from "@/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/dialog-friendly";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { resolveBaseUrl } from "@/lib/base-url";
import { getEnabledRegions, isCNExclusive } from "@/lib/enabled-regions";
import { trpc } from "@/lib/trpc-client";
import type { Region } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AtSign,
  Check,
  Copy,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  PartyPopper,
  Sparkles,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

interface OnboardingDialogProps {
  open: boolean;
  onComplete: () => void;
  initialRegion: Region;
  initialUsername?: string | null;
  initialPublishProfile?: boolean;
  testMode?: boolean;
}

type Step = 1 | 2 | 3;

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

type RegionTheme = {
  /** Public path to a Twemoji SVG (CC-BY 4.0, see /public/flags/). */
  flagSrc: string;
  tagline: string;
  /** Chart token used as the region's selected accent (border + tint + check badge). */
  borderClass: string;
  bgClass: string;
  textClass: string;
};

const REGION_THEMES: Record<Region, RegionTheme> = {
  intl: {
    flagSrc: "/flags/intl.svg",
    tagline: "Asia / International",
    borderClass: "border-blue-700 dark:border-blue-200",
    bgClass: "bg-blue-300/20",
    textClass: "text-blue-700 dark:text-blue-200",
  },
  jp: {
    flagSrc: "/flags/jp.svg",
    tagline: "maimai でらっくす",
    borderClass: "border-red-700 dark:border-red-200",
    bgClass: "bg-red-300/20",
    textClass: "text-red-700 dark:text-red-200",
  },
  cn: {
    flagSrc: "/flags/cn.svg",
    tagline: "舞萌 DX",
    borderClass: "border-yellow-700 dark:border-yellow-200",
    bgClass: "bg-yellow-300/20",
    textClass: "text-yellow-700 dark:text-yellow-200",
  },
};

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "");
}

export function OnboardingDialog({
  open,
  onComplete,
  initialRegion,
  initialUsername,
  initialPublishProfile,
  testMode = false,
}: OnboardingDialogProps) {
  const t = useTranslations();
  const cnOnly = isCNExclusive();
  const enabledRegions = getEnabledRegions();

  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [username, setUsername] = useState(initialUsername ?? "");
  const [publishProfile, setPublishProfile] = useState(initialPublishProfile ?? false);
  const [selectedRegion, setSelectedRegion] = useState<Region>(initialRegion);

  const roRef = useRef<ResizeObserver | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

  const contentRefCallback = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!node) return;
    const update = () => {
      const h = node.offsetHeight;
      if (h > 0) setMeasuredHeight(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    roRef.current = ro;
  }, []);

  useEffect(() => {
    if (open) {
      setStep(1);
      setDirection(1);
      setUsername(initialUsername ?? "");
      setPublishProfile(initialPublishProfile ?? false);
      setSelectedRegion(initialRegion);
    }
  }, [open, initialUsername, initialPublishProfile, initialRegion]);

  const shouldSuggest = open && !initialUsername && !username;
  const { data: suggestedData } = trpc.username.getSuggestedUsername.useQuery(undefined, {
    enabled: shouldSuggest,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (suggestedData?.suggestedUsername && !username) {
      setUsername(suggestedData.suggestedUsername);
    }
  }, [suggestedData, username]);

  const availabilityQuery = trpc.username.checkUsernameAvailability.useQuery(
    { username },
    {
      enabled: username.length > 0 && USERNAME_REGEX.test(username),
      refetchOnWindowFocus: false,
    }
  );

  const isLocallyValid = username.length > 0 && USERNAME_REGEX.test(username);
  const isOwnUsername = !!initialUsername && username === initialUsername;
  const isAvailable = isOwnUsername || availabilityQuery.data?.available === true;
  const availabilityError =
    availabilityQuery.data?.available === false ? availabilityQuery.data.error : undefined;
  const isChecking =
    isLocallyValid && !isOwnUsername && (availabilityQuery.isFetching || availabilityQuery.isLoading);

  const setUsernameMutation = trpc.username.setUsername.useMutation();
  const updatePublishProfileMutation = trpc.user.updatePublishProfile.useMutation();
  const updateRegionMutation = trpc.user.updateRegion.useMutation();

  const isSubmittingStep1 =
    setUsernameMutation.isPending || updatePublishProfileMutation.isPending;
  const isSubmittingStep2 = updateRegionMutation.isPending;

  const baseHost = useMemo(() => stripProtocol(resolveBaseUrl()), []);
  const profileUrl = useMemo(() => {
    if (!username || !isLocallyValid) return null;
    return `${baseHost}/profile/${encodeURIComponent(username)}`;
  }, [baseHost, username, isLocallyValid]);

  const goNextStep1 = async () => {
    if (!isLocallyValid || !isAvailable) return;
    try {
      if (!isOwnUsername) {
        await setUsernameMutation.mutateAsync({ username: username.trim() });
      }
      await updatePublishProfileMutation.mutateAsync({ publishProfile });
      setDirection(1);
      setStep(cnOnly ? 3 : 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("usernameSetup.chooseAvailable");
      toast.error(message);
    }
  };

  const goNextStep2 = async () => {
    try {
      await updateRegionMutation.mutateAsync({ region: selectedRegion });
      setDirection(1);
      setStep(3);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update region";
      toast.error(message);
    }
  };

  const goPrev = () => {
    setDirection(-1);
    if (step === 3 && cnOnly) {
      setStep(1);
    } else if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const usernameInitial = (username[0] ?? "?").toUpperCase();

  const handleCopyUrl = async () => {
    if (!profileUrl) return;
    try {
      await navigator.clipboard.writeText(`https://${profileUrl}`);
      toast.success(t("tokenDialog.clipboard.copied"));
    } catch {
      toast.error(t("tokenDialog.clipboard.failed"));
    }
  };

  // Stable random offsets for confetti sparkles (so they don't reshuffle each render).
  const confettiBursts = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const dist = 60 + Math.random() * 40;
        return {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          delay: 0.15 + Math.random() * 0.25,
          rotate: Math.random() * 360,
          size: 8 + Math.random() * 8,
        };
      }),
    []
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={() => { }} dismissible={false}>
      <ResponsiveDialogContent
        className="sm:max-w-lg p-0! gap-0"
        onPointerDownOutside={(e: Event) => e.preventDefault()}
        onEscapeKeyDown={(e: Event) => e.preventDefault()}
        showCloseButton={false}
      >
        {/* Hero band — tonal primary surface, layered light + maimai-arc decoration for depth */}
        <div className="relative h-16 overflow-hidden rounded-t-lg bg-primary text-primary-foreground">
          {/* Top edge sheen, brightens top-of-hero like a soft top light */}
          <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-primary-foreground/10 to-transparent pointer-events-none" />
          {/* Top-left primary highlight, bigger + brighter than before */}
          <div
            className="absolute -top-14 -left-10 w-48 h-48 rounded-full opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(closest-side, var(--primary-foreground), transparent 65%)",
            }}
          />
          {/* Bottom-right shadow vignette, anchors the hero to the body */}
          <div
            className="absolute -bottom-16 right-20 w-40 h-32 rounded-full opacity-25 pointer-events-none mix-blend-multiply"
            style={{
              background:
                "radial-gradient(closest-side, var(--foreground), transparent 70%)",
            }}
          />
          {/* Decorative step icon, larger but lighter, peeks from the bottom-right */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`hero-icon-${step}`}
              initial={{ opacity: 0, scale: 0.7, x: 20, rotate: -12 }}
              animate={{ opacity: 0.14, scale: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.7, x: -20, rotate: 12 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -right-3 -bottom-6"
              aria-hidden
            >
              {step === 1 && <AtSign className="h-24 w-24" strokeWidth={1.25} />}
              {step === 2 && <Globe2 className="h-24 w-24" strokeWidth={1.25} />}
              {step === 3 && <PartyPopper className="h-24 w-24" strokeWidth={1.25} />}
            </motion.div>
          </AnimatePresence>
          {/* Foreground content */}
          <div className="relative z-10 h-full flex items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="font-semibold tracking-tight">
                {t("onboarding.title")}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-2.5 py-1.5 backdrop-blur-[2px]">
              {[1, 2, 3].map((n) => {
                if (cnOnly && n === 2) return null;
                const isActive = n === step;
                const isDone = n < step || (cnOnly && n === 2 && step === 3);
                return (
                  <motion.div
                    key={n}
                    layout
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "h-1.5 rounded-full",
                      isActive
                        ? "w-6 bg-primary-foreground"
                        : isDone
                          ? "w-1.5 bg-primary-foreground/80"
                          : "w-1.5 bg-primary-foreground/40"
                    )}
                  />
                );
              })}
            </div>
          </div>
          {/* Inner shadow on the bottom edge, gives the hero physical depth */}
          <div
            className="absolute inset-x-0 bottom-0 h-3 pointer-events-none"
            style={{
              background:
                "linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.18))",
            }}
          />
        </div>

        <div className="px-6 pb-6 pt-5">
          <ResponsiveDialogHeader className="mb-4">
            <ResponsiveDialogTitle className="text-2xl font-bold tracking-tight">
              {t(`onboarding.step${step}.title`)}
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          <motion.div
            initial={false}
            className="relative overflow-hidden"
            animate={{ height: measuredHeight ?? "auto" }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
          >
            <AnimatePresence initial={false}>
              {step === 1 && (
                <motion.div
                  key="step1"
                  ref={contentRefCallback}
                  initial={{ opacity: 0, x: 60 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: -60 * direction,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                  }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="space-y-5"
                >
                  {/* Big avatar preview */}
                  <div className="flex flex-col items-center gap-3 pb-1">
                    <motion.div
                      key={usernameInitial}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 320, damping: 20 }}
                      className="relative"
                    >
                      <div className="w-20 h-20 rounded-xl border-2 border-chart-2/60 bg-chart-2/10 flex items-center justify-center relative">
                        <div className="absolute inset-1.5 rounded-lg border border-chart-2/30" />
                        <span className="relative text-4xl font-black tracking-tight text-foreground">
                          {usernameInitial}
                        </span>
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-background border-2 border-background flex items-center justify-center">
                        <div
                          className={cn(
                            "w-full h-full rounded-full flex items-center justify-center transition-colors",
                            isLocallyValid && isAvailable && !isChecking
                              ? "bg-chart-2 text-white"
                              : isChecking
                                ? "bg-muted text-muted-foreground"
                                : username.length > 0
                                  ? "bg-destructive text-white"
                                  : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isChecking ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isLocallyValid && isAvailable ? (
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          ) : username.length > 0 ? (
                            <XCircle className="h-3.5 w-3.5" />
                          ) : (
                            <AtSign className="h-3.5 w-3.5" />
                          )}
                        </div>
                      </div>
                    </motion.div>
                    <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
                      {t("onboarding.step1.description")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="onboarding-username" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      {t("usernameSetup.usernameLabel")}
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <AtSign className="h-4 w-4" />
                      </div>
                      <Input
                        id="onboarding-username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={t("usernameSetup.placeholder")}
                        className={cn(
                          "pl-9 pr-3 h-11 text-base font-mono",
                          username && !isLocallyValid && "border-red-500"
                        )}
                        maxLength={32}
                        autoComplete="off"
                      />
                    </div>
                    <div className="min-h-[1rem] text-xs">
                      {isChecking && (
                        <span className="text-muted-foreground">{t("usernameSetup.checking")}</span>
                      )}
                      {!isChecking && isAvailable && username.length > 0 && (
                        <span className="text-chart-2 font-medium">
                          ✓ {t("usernameSetup.available")}
                        </span>
                      )}
                      {!isChecking && username.length > 0 && !isLocallyValid && (
                        <span className="text-destructive">
                          {t("usernameSetup.validation.format")}
                        </span>
                      )}
                      {!isChecking && isLocallyValid && availabilityError && (
                        <span className="text-destructive">{availabilityError}</span>
                      )}
                    </div>
                  </div>

                  {/* Publish toggle as a stylish card */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPublishProfile((v) => !v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setPublishProfile((v) => !v);
                      }
                    }}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-4 transition-all cursor-pointer",
                      publishProfile
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                          publishProfile
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {publishProfile ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {t("onboarding.step1.publishToggleLabel")}
                          </span>
                          <Switch
                            checked={publishProfile}
                            onCheckedChange={setPublishProfile}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t("onboarding.step1.publishToggleDescription")}
                        </p>
                        <AnimatePresence initial={false}>
                          {publishProfile && profileUrl && (
                            <motion.div
                              key="url-preview"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              className="overflow-hidden"
                            >
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleCopyUrl();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void handleCopyUrl();
                                  }
                                }}
                                className="mt-3 cursor-pointer p-2.5 bg-background rounded-lg border text-xs font-mono break-all hover:bg-accent/40 transition-all flex items-center gap-2 group"
                              >
                                <Globe2 className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
                                <span className="flex-1 text-foreground">{profileUrl}</span>
                                <Copy className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step2"
                  ref={contentRefCallback}
                  initial={{ opacity: 0, x: 60 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: -60 * direction,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                  }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="space-y-5"
                >
                  <p className="text-sm text-muted-foreground text-center max-w-md mx-auto leading-relaxed">
                    {t("onboarding.step2.description")}
                  </p>
                  <div
                    className={cn(
                      "grid gap-3",
                      enabledRegions.length === 1 && "grid-cols-1",
                      enabledRegions.length === 2 && "grid-cols-2",
                      enabledRegions.length === 3 && "grid-cols-3"
                    )}
                  >
                    {enabledRegions.map((region, idx) => {
                      const isSelected = selectedRegion === region;
                      const theme = REGION_THEMES[region];
                      return (
                        <motion.button
                          key={region}
                          type="button"
                          onClick={() => setSelectedRegion(region)}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: 0.05 * idx,
                            duration: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          whileHover={{ y: -3 }}
                          whileTap={{ scale: 0.97 }}
                          className={cn(
                            "relative overflow-hidden rounded-xl border-2 p-4 text-center transition-colors aspect-[3/4] flex flex-col items-center justify-center gap-2.5",
                            isSelected
                              ? cn(theme.borderClass, theme.bgClass)
                              : "border-border bg-card hover:border-foreground/20 hover:bg-accent/40"
                          )}
                        >
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0, rotate: -30 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 380,
                                  damping: 22,
                                }}
                                className={cn(
                                  "absolute top-2.5 right-2.5 w-6 h-6 rounded-full text-white flex items-center justify-center z-10",
                                  region === "intl" && "bg-blue-300",
                                  region === "jp" && "bg-red-300",
                                  region === "cn" && "bg-yellow-300"
                                )}
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <motion.div
                            animate={
                              isSelected
                                ? { scale: [1, 1.12, 1], rotate: [0, -4, 4, 0] }
                                : { scale: 1, rotate: 0 }
                            }
                            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            className="size-14 flex items-center justify-center select-none"
                          >
                            <Image
                              src={theme.flagSrc}
                              alt=""
                              aria-hidden
                              draggable={false}
                              width={56}
                              height={56}
                              unoptimized
                              className="max-h-full max-w-full object-contain drop-shadow-sm saturate-[.78]"
                            />
                          </motion.div>
                          <div className="space-y-0.5">
                            <p
                              className={cn(
                                "font-semibold text-sm leading-tight tracking-tight",
                                isSelected && theme.textClass
                              )}
                            >
                              {t(`regions.${region}`)}
                            </p>
                            <p className={cn(
                              "text-[10px] leading-tight text-muted-foreground",
                              isSelected && theme.textClass
                            )}>
                              {theme.tagline}
                            </p>
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step3"
                  ref={contentRefCallback}
                  initial={{ opacity: 0, x: 60 * direction }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    x: -60 * direction,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                  }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="space-y-5 py-4 text-center"
                >
                  <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                    {/* Confetti burst */}
                    {confettiBursts.map((b, i) => (
                      <motion.div
                        key={i}
                        initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                        animate={{
                          x: b.x,
                          y: b.y,
                          opacity: [0, 1, 0],
                          scale: [0, 1, 0.6],
                          rotate: b.rotate,
                        }}
                        transition={{
                          duration: 1.4,
                          delay: b.delay,
                          ease: "easeOut",
                        }}
                        className="absolute"
                        style={{ width: b.size, height: b.size }}
                      >
                        <div
                          className={cn(
                            "w-full h-full rounded-[2px]",
                            i % 5 === 0 && "bg-chart-1",
                            i % 5 === 1 && "bg-chart-2",
                            i % 5 === 2 && "bg-chart-3",
                            i % 5 === 3 && "bg-chart-4",
                            i % 5 === 4 && "bg-chart-5"
                          )}
                        />
                      </motion.div>
                    ))}
                    {/* Outlined accent rings, each in a different chart hue */}
                    <div className="absolute inset-0 rounded-full border-2 border-chart-2/40" />
                    <div className="absolute inset-2 rounded-full border-2 border-chart-5/35" />
                    {/* Pulse */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: [0.8, 1.4, 1.8], opacity: [0.45, 0.2, 0] }}
                      transition={{
                        duration: 1.6,
                        ease: [0.22, 1, 0.36, 1],
                        repeat: Infinity,
                        repeatDelay: 0.6,
                      }}
                      className="absolute inset-0 rounded-full border-2 border-chart-1"
                    />
                    <motion.div
                      initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
                      animate={{ scale: 1, opacity: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 280, damping: 16 }}
                      className="relative w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                    >
                      <PartyPopper className="h-10 w-10" />
                    </motion.div>
                  </div>
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.4 }}
                    className="text-sm text-muted-foreground leading-relaxed px-2"
                  >
                    {t("onboarding.step3.description", { host: baseHost })}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="pt-5 mt-5 border-t">
            {step !== 3 ? (
              <div className="flex justify-between gap-3">
                <Button variant="ghost" onClick={goPrev} disabled={step === 1}>
                  {t("onboarding.navigation.previous")}
                </Button>
                {step === 1 && (
                  <Button
                    size="lg"
                    onClick={goNextStep1}
                    disabled={
                      !isLocallyValid || !isAvailable || isChecking || isSubmittingStep1
                    }
                    className="min-w-32"
                  >
                    {isSubmittingStep1 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("onboarding.navigation.saving")}
                      </>
                    ) : (
                      t("onboarding.navigation.next")
                    )}
                  </Button>
                )}
                {step === 2 && (
                  <Button
                    size="lg"
                    onClick={goNextStep2}
                    disabled={isSubmittingStep2}
                    className="min-w-32"
                  >
                    {isSubmittingStep2 ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t("onboarding.navigation.saving")}
                      </>
                    ) : (
                      t("onboarding.navigation.next")
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <Button
                size="lg"
                className="w-full font-semibold"
                onClick={onComplete}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                {t("onboarding.step3.goToDashboard")}
              </Button>
            )}
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
