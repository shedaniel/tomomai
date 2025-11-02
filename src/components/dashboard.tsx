"use client";

import { DataBanner } from "@/components/data-banner";
import { DataContent } from "@/components/data-content";
import { SettingsDialog } from "@/components/settings-dialog";
import { TokenDialog } from "@/components/token-dialog";
import { UserHeader } from "@/components/user-header";
import { UsernameSetupDialog } from "@/components/username-setup-dialog";
import { useFetchSession } from "@/hooks/useFetchSession";
import { useSnapshots } from "@/hooks/useSnapshots";
import { signOut } from "@/lib/auth-client";
import { Flags } from "@/lib/flags";
import { trpc } from "@/lib/trpc-client";
import { Region, User, UserData, ProfileSettings, Snapshot, SnapshotWithSongs } from "@/lib/types";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface DashboardProps {
  user: User;
  initialUserData: UserData;
  initialHasToken: boolean;
  initialTimezone: string | null;
  initialProfileSettings: ProfileSettings;
  initialSnapshots: Snapshot[];
  initialSnapshotData?: SnapshotWithSongs;
  flags: Flags;
}

export function Dashboard({ user, initialUserData, initialHasToken, initialTimezone, initialProfileSettings, initialSnapshots, initialSnapshotData, flags }: DashboardProps) {
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUsernameSetupOpen, setIsUsernameSetupOpen] = useState(false);

  // Check if user has username
  const { data: userData, refetch: refetchUserData } = trpc.user.getUserData.useQuery(
    undefined,
    { 
      refetchOnWindowFocus: false,
      initialData: initialUserData,
    }
  );

  // Use the stored region preference, fallback to "intl" if not set
  const selectedRegion: Region = (userData?.region as Region) || "intl";

  // Show username setup dialog if user doesn't have username
  useEffect(() => {
    if (userData && !userData.hasUsername) {
      setIsUsernameSetupOpen(true);
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
  } = useFetchSession(refreshSnapshots, flags);

  // Check if user has a saved token for the current region (with initial server data)
  const { data: tokenData, isLoading: isLoadingToken } = trpc.user.hasToken.useQuery(
    { region: selectedRegion },
    { 
      refetchOnWindowFocus: false,
      initialData: { hasToken: initialHasToken },
    }
  );

  // Get user timezone (with initial server data)
  const { data: timezoneData, refetch: refetchTimezone } = trpc.user.getTimezone.useQuery(
    undefined,
    { 
      refetchOnWindowFocus: false,
      initialData: { timezone: initialTimezone },
    }
  );

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

  // Update timezone mutation
  const updateTimezoneMutation = trpc.user.updateTimezone.useMutation({
    onSuccess: () => {
      toast.success("Timezone updated successfully!");
      refetchTimezone();
    },
    onError: (error) => {
      toast.error(`Failed to update timezone: ${error.message}`);
    },
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
    // Only attempt auto-fetch if we're sure the user has a saved token
    if (!isLoadingToken && tokenData?.hasToken === true) {
      // Start automatic fetch with saved token
      try {
        await startAutomaticFetch(selectedRegion);
      } catch (error) {
        console.error("Auto fetch failed:", error);
        
        // Show toast error and open token dialog for rate limiting or other errors
        if (error instanceof Error) {
          toast.error(error.message);
          
          // If it's not a rate limit error, open the token dialog
          if (!error.message.includes("Rate limited")) {
            setIsTokenDialogOpen(true);
          }
        } else {
          toast.error("Failed to start data fetch");
          setIsTokenDialogOpen(true);
        }
      }
    } else {
      // Show token input dialog (either no token, or still loading token state)
      setIsTokenDialogOpen(true);
    }
  };

  const closeTokenDialog = () => {
    setIsTokenDialogOpen(false);
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

  const handleSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleOpenTokenDialog = () => {
    setIsSettingsOpen(false); // Close settings dialog
    setIsTokenDialogOpen(true); // Open token dialog
  };

  const handleTimezoneUpdate = async (timezone: string | null) => {
    await updateTimezoneMutation.mutateAsync({ timezone });
  };

  const handleUsernameSetupComplete = () => {
    setIsUsernameSetupOpen(false);
    refetchUserData(); // Refresh to update the state
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
      <UserHeader 
        user={user}
        userRole={userData?.role ?? "user"}
        selectedRegion={selectedRegion}
        onRegionChange={handleRegionChange}
        onLogout={handleLogout}
        onSettings={handleSettings}
        flags={flags}
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
          userTimezone={timezoneData?.timezone ?? null}
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
        isOpen={isTokenDialogOpen}
        onClose={closeTokenDialog}
        onTokenUpdate={handleTokenUpdate}
        newTokenDialog={flags.newTokenDialog}
        startSessionPolling={startSessionPolling}
        stopSessionPolling={stopSessionPolling}
      />

      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        currentTimezone={timezoneData?.timezone ?? null}
        username={userData?.username ?? undefined}
        initialProfileSettings={initialProfileSettings}
        onTimezoneUpdate={handleTimezoneUpdate}
        onOpenTokenDialog={handleOpenTokenDialog}
        onSaveSuccess={refetchUserData}
      />

      <UsernameSetupDialog
        open={isUsernameSetupOpen}
        onComplete={handleUsernameSetupComplete}
      />
    </div>
  );
} 