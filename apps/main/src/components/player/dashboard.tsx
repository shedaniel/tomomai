"use client";

import { useGame } from "@/components/providers/game-provider";
import { getGameRegion, supportsGameFeature } from "@/lib/games/frontend";
import type { GameSnapshotData, GameSnapshotSummary } from "@/lib/games/player-view";
import { GameUnavailable } from "@/components/player/game-unavailable";
import { DataBanner } from "@/components/player/data-banner";
import { DataContent } from "@/components/player/data-content";
import { FetchToastContainer } from "@/components/fetch-toast";
import { TokenDialog } from "@/components/token-dialog";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { AlbumPrivacyDialog } from "@/components/games/maimai/album-privacy-dialog";
import { useFetchSession } from "@/hooks/useFetchSession";
import { useSnapshots } from "@/hooks/useSnapshots";
import { signOut } from "@/lib/auth-client";
import { Flags } from "@/lib/flags";
import { isTokenError } from "@/lib/token-errors";
import { parseFetchErrorCode } from "@/lib/games/fetch-error-codes";
import { trpc } from "@/lib/trpc-client";
import type { Region, User, UserData } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { AboutDialog } from "@/components/about-dialog";
import { AdminDialog } from "@/components/dialogs/admin-dialog";
import { ExperimentsDialog } from "@/components/experiments-dialog";
import { InvitesDialog } from "@/components/invites-dialog";
import { Header } from "@/components/header";
import { ChangelogDialog } from "@/components/changelog-dialog";
import { ConsentGate } from "@/components/consent-gate";
import { TomomaiAI } from "@/components/games/maimai/tomomai-ai";
import { PostMeta } from "@/lib/posts";
import { HttpProxyAuthSubDialog } from "@/components/games/maimai/cn-token-dialog";

type DialogType = null | "token" | "token-cn-proxy" | "onboarding" | "about" | "admin" | "invites" | "experiments" | "albumPrivacy";

interface DashboardProps {
  user: User;
  initialUserData: UserData;
  initialSnapshots: GameSnapshotSummary[];
  initialSnapshotData?: GameSnapshotData;
  flags: Flags;
  latestPost: PostMeta | null;
}

export function Dashboard(props: DashboardProps) {
  const game = useGame();
  const region = getGameRegion(game, props.initialUserData.region);
  if (!region) return <GameUnavailable />;
  return <AvailableDashboard {...props} initialRegion={region} />;
}

function AvailableDashboard({ user, initialUserData, initialSnapshots, initialSnapshotData, flags, latestPost, initialRegion }: DashboardProps & { initialRegion: Region }) {
  const game = useGame();
  const supportsFetch = supportsGameFeature(game, "scores");

  const [dialogType, setDialogType] = useState<DialogType>(null);
  const t = useTranslations("dashboard");

  // Check if user has username
  const { data: userData, refetch: refetchUserData } = trpc.user.getUserData.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      initialData: initialUserData,
    }
  );

  const selectedRegion = getGameRegion(game, userData?.region) ?? initialRegion;

  // Show onboarding dialog if user doesn't have username
  useEffect(() => {
    if (userData && !userData.hasUsername) {
      setDialogType("onboarding");
    }
  }, [userData]);

  const {
    snapshots,
    selectedSnapshot,
    selectedSnapshotData,
    setSelectedSnapshot,
    deleteSnapshot,
    copySnapshot,
    isCopying,
    isLoading: isLoadingSnapshots,
    refreshSnapshots,
  } = useSnapshots(selectedRegion, true, {
    initialSnapshots,
    initialSnapshotData,
  });

  const {
    isFetching,
    currentSession,
    startDataFetch,
    startAutomaticFetch,
    startSessionPolling,
    stopSessionPolling,
    fetchToastState,
  } = useFetchSession(refreshSnapshots, () => {
    setDialogType("token");
  }, () => {
    setDialogType("albumPrivacy");
  }, () => {
    setDialogType("token-cn-proxy");
  });

  // Update region mutation
  const updateRegionMutation = trpc.user.updateRegion.useMutation({
    onSuccess: () => {
      toast.success(t("regionUpdateSuccess"));
      refetchUserData();
    },
    onError: (error) => {
      toast.error(t("regionUpdateError", { error: error.message }));
    },
  });

  // Album preference mutation
  const setAlbumPreferenceMutation = trpc.user.setAlbumPreference.useMutation({
    onSuccess: async () => {
      toast.success("Album preference saved successfully");
      setDialogType(null);

      // After setting preference, retry the fetch with current selectedRegion
      try {
        await startAutomaticFetch(selectedRegion);
      } catch {
        // Error will be handled by useFetchSession
      }
    },
    onError: () => {
      toast.error("Failed to save album preference");
    }
  });

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleRegionChange = async (region: Region) => {
    try {
      await updateRegionMutation.mutateAsync({ region });
      // Reload the page
      window.location.reload();
    } catch (error) {
      console.error("Failed to update region:", error);
    }
  };

  const handleFetchData = async () => {
    try {

      await startAutomaticFetch(selectedRegion);
    } catch (error) {
      console.error("Auto fetch failed:", error);

      if (error instanceof Error) {
        if (parseFetchErrorCode(error.message) === "CN_COOKIES_SINGLE_USE") {
          setDialogType("token-cn-proxy");
        } else if (isTokenError(error.message)) {
          toast.error(error.message);
          setDialogType("token");
        } else {
          toast.error(error.message);
        }
      } else {
        toast.error("Failed to start data fetch");
        setDialogType("token");
      }
    }
  };

  const handleTokenUpdate = async (token: string) => {
    try {
      // Just start the fetch with the new token (this will save and use it)
      await startDataFetch(selectedRegion, token);
      toast.success("Token saved successfully!");
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error("Failed to save token");
      }
      // Re-throw the error so TokenDialog doesn't close on failure
      throw error;
    }
  };

  const handleUsernameSetupComplete = () => {
    setDialogType(null);
    refetchUserData();
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    try {
      await deleteSnapshot(snapshotId);
      toast.success("Snapshot deleted successfully!");
    } catch (error) {
      console.error("Failed to delete snapshot:", error);
      if (error instanceof Error) {
        toast.error(`Failed to delete snapshot: ${error.message}`);
      } else {
        toast.error("Failed to delete snapshot");
      }
    }
  };

  const handleCopySnapshot = async (snapshotId: string, targetVersion: number) => {
    try {
      const result = await copySnapshot(snapshotId, targetVersion);
      return result;
    } catch (error) {
      console.error("Failed to copy snapshot:", error);
      throw error; // Re-throw to let DataBanner handle the error display
    }
  };

  return (
    <div className="container mx-auto max-w-[1300px] px-3 md:px-6 lg:px-12 py-8">
      <Header
        currentTab="dashboard"
        showDiscordBanner={false}
        customThemesEnabled={flags.customThemes}
        user={{
          user,
          menu: {
            userRole: userData?.role ?? "user",
            selectedRegion: selectedRegion,
            onRegionChange: handleRegionChange,
            onInvites: () => setDialogType("invites"),
            onAdmin: () => setDialogType("admin"),
            onTestOnboarding: () => setDialogType("onboarding"),
            onExperiments: () => setDialogType("experiments"),
            onLogout: handleLogout,
          },
        }}
      />

      <div className="space-y-6">
        <DataBanner
          region={selectedRegion}
          snapshots={snapshots}
          selectedSnapshot={selectedSnapshot}
          onSnapshotChange={setSelectedSnapshot}
          onDeleteSnapshot={handleDeleteSnapshot}
          onFetchData={handleFetchData}
          isFetching={isFetching}
          currentSession={currentSession}
          onCopySnapshot={handleCopySnapshot}
          isCopying={isCopying}
          supportsCopy={supportsGameFeature(game, "snapshot-copy")}
          supportsFetch={supportsFetch}
        />

        <DataContent
          region={selectedRegion}
          selectedSnapshotData={selectedSnapshotData || null}
          isLoading={isLoadingSnapshots}
          visitableProfileAt={userData?.publishProfile ? userData?.username : null}
          profileUsername={userData?.username}
          publishProfile={userData?.publishProfile}
          isOwner={true}
          visitedBySelf={true}
          flags={flags}
        />
      </div>

      {supportsFetch && <TokenDialog
        region={selectedRegion}
        isOpen={dialogType === "token"}
        onOpenChange={open => setDialogType(open ? "token" : null)}
        onTokenUpdate={handleTokenUpdate}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />} 

      {supportsFetch && game.loginMethods[selectedRegion]?.includes("maimai-cn") ? (
        <HttpProxyAuthSubDialog
          isOpen={dialogType === "token-cn-proxy"}
          onOpenChange={open => setDialogType(open ? "token-cn-proxy" : null)}
          onAuthorized={() => setDialogType(null)}
          startSessionPolling={startSessionPolling}
          stopSessionPolling={stopSessionPolling}
          modal={true}
        />
      ) : null}

      <OnboardingDialog
        open={dialogType === "onboarding"}
        onComplete={handleUsernameSetupComplete}
        initialRegion={selectedRegion}
        initialUsername={userData?.username}
        initialPublishProfile={userData?.publishProfile}
      />

      <AboutDialog open={dialogType === "about"} onOpenChange={open => setDialogType(open ? "about" : null)} />
      <InvitesDialog isOpen={dialogType === "invites"} onOpenChange={open => setDialogType(open ? "invites" : null)} />
      <AdminDialog open={dialogType === "admin"} onOpenChange={open => setDialogType(open ? "admin" : null)} />
      <ExperimentsDialog open={dialogType === "experiments"} onOpenChange={open => setDialogType(open ? "experiments" : null)} />

      {supportsGameFeature(game, "albums", selectedRegion) && <AlbumPrivacyDialog
        open={dialogType === "albumPrivacy"}
        onOpenChange={open => setDialogType(open ? "albumPrivacy" : null)}
        onSelectPreference={(fetchUseAlbums) => {
          setAlbumPreferenceMutation.mutate({ fetchUseAlbums });
        }}
        isPending={setAlbumPreferenceMutation.isPending}
      />}

      <ChangelogDialog latestPost={latestPost} />

      <ConsentGate />

      <FetchToastContainer state={fetchToastState} />
      {supportsGameFeature(game, "assistant") && <TomomaiAI snapshotData={selectedSnapshotData || null} region={selectedRegion} aprilFools2026={flags.aprilFools2026} />}
    </div>
  );
}
