"use client";

import { DataBanner } from "@/components/data-banner";
import { DataContent } from "@/components/data-content";
import { FetchToastContainer } from "@/components/fetch-toast";
import { SettingsDialog } from "@/components/settings-dialog";
import { TokenDialog } from "@/components/token-dialog";
import { UsernameSetupDialog } from "@/components/username-setup-dialog";
import { AlbumPrivacyDialog } from "@/components/album-privacy-dialog";
import { useFetchSession } from "@/hooks/useFetchSession";
import { useSnapshots } from "@/hooks/useSnapshots";
import { signOut } from "@/lib/auth-client";
import { Flags } from "@/lib/flags";
import { isTokenError } from "@/lib/token-errors";
import { trpc } from "@/lib/trpc-client";
import { ProfileSettings, Region, Snapshot, SnapshotWithSongs, User, UserData } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AboutDialog } from "./about-dialog";
import { AdminDialog } from "./dialogs/admin-dialog";
import { ExperimentsDialog } from "./experiments-dialog";
import { InvitesDialog } from "./invites-dialog";
import { Header } from "./header";
import { isChinaRegion } from "@/lib/enabled-regions";
import { ChangelogDialog } from "./changelog-dialog";
import { PostMeta } from "@/lib/posts";

type DialogType = null | "token" | "settings" | "username" | "about" | "admin" | "invites" | "experiments" | "albumPrivacy";

interface DashboardProps {
  user: User;
  initialUserData: UserData;
  initialProfileSettings: ProfileSettings;
  initialSnapshots: Snapshot[];
  initialSnapshotData?: SnapshotWithSongs;
  flags: Flags;
  latestPost?: PostMeta | null;
}

export function Dashboard({ user, initialUserData, initialProfileSettings, initialSnapshots, initialSnapshotData, flags, latestPost }: DashboardProps) {
  const [dialogType, setDialogType] = useState<DialogType>(null);

  // Check if user has username
  const { data: userData, refetch: refetchUserData } = trpc.user.getUserData.useQuery(
    undefined,
    {
      refetchOnWindowFocus: false,
      initialData: initialUserData,
    }
  );

  // Use the stored region preference, fallback to "intl" or "cn" if not set
  const selectedRegion: Region = (userData?.region as Region) || (isChinaRegion() ? "cn" : "intl");

  // Show username setup dialog if user doesn't have username
  useEffect(() => {
    if (userData && !userData.hasUsername) {
      setDialogType("username");
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
  } = useFetchSession(refreshSnapshots, flags, () => {
    // Called when a token-related error is detected during fetch
    setDialogType("token");
  }, () => {
    // Called when album preference not set
    setDialogType("albumPrivacy");
  });

  // Update region mutation
  const updateRegionMutation = trpc.user.updateRegion.useMutation({
    onSuccess: () => {
      toast.success("Region updated successfully!");
      refetchUserData();
    },
    onError: (error) => {
      toast.error(`Failed to update region: ${error.message}`);
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
      } catch (error) {
        // Error will be handled by useFetchSession
      }
    },
    onError: (error) => {
      toast.error("Failed to save album preference");
    }
  });

  const handleLogout = async () => {
    try {
      await signOut();
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
        toast.error(error.message);

        // Only show token dialog if the error is about missing token
        if (isTokenError(error.message)) {
          setDialogType("token");
        }
        // For other errors (rate limiting, fetch in progress, etc.), just show the toast
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
    <div className="container mx-auto max-w-[1300px] px-4 py-8">
      <Header
        currentTab="dashboard"
        showDiscordBanner={false}
        user={{
          user,
          menu: {
            userRole: userData?.role ?? "user",
            selectedRegion: selectedRegion,
            onRegionChange: handleRegionChange,
            onInvites: () => setDialogType("invites"),
            onAdmin: () => setDialogType("admin"),
            onExperiments: () => setDialogType("experiments"),
            onSettings: () => setDialogType("settings"),
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
        />

        <DataContent
          region={selectedRegion}
          selectedSnapshotData={selectedSnapshotData || null}
          isLoading={isLoadingSnapshots}
          visitableProfileAt={userData?.publishProfile ? userData?.username : null}
          visitedBySelf={true}
          flags={flags}
        />
      </div>

      <TokenDialog
        region={selectedRegion}
        isOpen={dialogType === "token"}
        onOpenChange={open => setDialogType(open ? "token" : null)}
        onTokenUpdate={handleTokenUpdate}
        newTokenDialog={flags.newTokenDialog}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />

      <SettingsDialog
        open={dialogType === "settings"}
        onOpenChange={open => setDialogType(open ? "settings" : null)}
        username={userData?.username ?? undefined}
        initialProfileSettings={initialProfileSettings}
        onOpenTokenDialog={() => setDialogType("token")}
        onSaveSuccess={refetchUserData}
      />

      <UsernameSetupDialog
        open={dialogType === "username"}
        onComplete={handleUsernameSetupComplete}
      />

      <AboutDialog open={dialogType === "about"} onOpenChange={open => setDialogType(open ? "about" : null)} />
      <InvitesDialog isOpen={dialogType === "invites"} onOpenChange={open => setDialogType(open ? "invites" : null)} />
      <AdminDialog open={dialogType === "admin"} onOpenChange={open => setDialogType(open ? "admin" : null)} />
      <ExperimentsDialog open={dialogType === "experiments"} onOpenChange={open => setDialogType(open ? "experiments" : null)} initialFlags={flags} />

      <AlbumPrivacyDialog
        open={dialogType === "albumPrivacy"}
        onOpenChange={open => setDialogType(open ? "albumPrivacy" : null)}
        onSelectPreference={(fetchUseAlbums) => {
          setAlbumPreferenceMutation.mutate({ fetchUseAlbums });
        }}
        isPending={setAlbumPreferenceMutation.isPending}
      />

      <ChangelogDialog latestPost={latestPost} />

      <FetchToastContainer state={fetchToastState} />
    </div>
  );
}
