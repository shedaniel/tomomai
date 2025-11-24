"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DoorOpen, Cigarette, MapPin, Clock, CircleDollarSign, ThumbsUp, ThumbsDown, Crown, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { StoreEditForm } from "./store-edit-form";
import { useSession } from "@/lib/auth-client";
import { motion, AnimatePresence } from "motion/react";
import { useTranslations } from "next-intl";
import { getGameName } from "@/lib/game-utils";

interface StoreEdit {
  id: bigint;
  userId: string;
  userName: string;
  name: string | null;
  address: string | null;
  openingHours: string | null;
  toilet: boolean | null;
  smoke: boolean | null;
  access: string | null;
  status: "open" | "closed" | "temporarily_closed" | null;
  currency: string | null;
  games: any;
  additionalInfo: any;
  createdAt: Date;
  updatedAt: Date;
  voteCount: number;
  isChosen: boolean;
}

interface Store {
  id: bigint;
  country: string;
  area: string | null;
  name: string;
  address: string;
}

interface StoreEditDetailsProps {
  edit: StoreEdit | null;
  storeName: string;
  storeAddress: string;
}

function StoreEditDetails({ edit, storeName, storeAddress }: StoreEditDetailsProps) {
  if (!edit) return null;

  const t = useTranslations();

  const displayName = edit.name || storeName;
  const displayAddress = edit.address || storeAddress;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-sm">Name</h4>
        <p className="text-sm">{displayName}</p>
      </div>

      <div>
        <h4 className="font-semibold text-sm">Address</h4>
        <p className="text-sm text-muted-foreground">{displayAddress}</p>
      </div>

      {edit.status && (
        <div className="flex items-center gap-2 text-sm">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          <span className="capitalize">
            {edit.status === "temporarily_closed"
              ? "Temporarily Closed"
              : edit.status}
          </span>
        </div>
      )}

      {edit.openingHours && (
        <div className="flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="whitespace-pre-wrap">{edit.openingHours}</span>
        </div>
      )}

      {edit.toilet !== null && edit.toilet !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <DoorOpen className="h-4 w-4 text-muted-foreground" />
          <span>Toilet: {edit.toilet ? "Available" : "Not Available"}</span>
        </div>
      )}

      {edit.smoke !== null && edit.smoke !== undefined && (
        <div className="flex items-center gap-2 text-sm">
          <Cigarette className="h-4 w-4 text-muted-foreground" />
          <span>Smoking: {edit.smoke ? "Allowed" : "Not Allowed"}</span>
        </div>
      )}

      {edit.access && (
        <div className="flex items-start gap-2 text-sm">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="whitespace-pre-wrap">{edit.access}</span>
        </div>
      )}

      {edit.currency && (
        <div className="flex items-center gap-2 text-sm">
          <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
          <span>{edit.currency}</span>
        </div>
      )}

      {edit.games && Object.keys(edit.games).length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Available Games</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(edit.games).map(([game, data]: [string, any]) => (
              <div key={game} className="flex justify-between">
                <span>{getGameName((k: string) => t.has(k) ? t(k) : k, game)}</span>
                <span>
                  {data.amount && data.price && " • "}
                  {data.price}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StoreEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  isLoggedIn: boolean;
}

export function StoreEditDrawer({ open, onOpenChange, store, isLoggedIn }: StoreEditDrawerProps) {
  const [expandedEditId, setExpandedEditId] = useState<bigint | null>(null);
  const [showPolicyDialog, setShowPolicyDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [editToDelete, setEditToDelete] = useState<bigint | null>(null);
  const { data: session } = useSession();

  // Fetch edits for this store
  const { data: editsData, refetch: refetchEdits, isRefetching: isRefetchingEdits } = trpc.user.getStoreEdits.useQuery(
    { storeId: store?.id || BigInt(0) },
    { enabled: open && !!store }
  );

  // Fetch user's votes (only if logged in)
  const { data: votesData, refetch: refetchVotes, isRefetching: isRefetchingVotes } = trpc.user.getUserStoreEditVotes.useQuery(
    { storeId: store?.id || BigInt(0) },
    { enabled: open && !!store && isLoggedIn }
  );

  // Derive user's edit from the list
  const userEdit = editsData?.edits.find(e => e.userId === session?.user?.id);
  const userEditData = { edit: userEdit || null };

  const utils = trpc.useUtils();

  const voteMutation = trpc.user.voteOnStoreEdit.useMutation({
    onSuccess: () => {
      utils.user.getStoreEdits.invalidate({ storeId: store?.id || BigInt(0) });
      utils.user.getUserStoreEditVotes.invalidate({ storeId: store?.id || BigInt(0) });
      utils.user.getStores.invalidate();
    },
  });

  const deleteMutation = trpc.user.deleteStoreEdit.useMutation({
    onSuccess: () => {
      utils.user.getStoreEdits.invalidate({ storeId: store?.id || BigInt(0) });
      utils.user.getUserStoreEditVotes.invalidate({ storeId: store?.id || BigInt(0) });
      utils.user.getStores.invalidate();
    },
  });

  const handleVote = (editId: bigint, vote: 'upvote' | 'downvote') => {
    if (!isLoggedIn) {
      alert("Please log in to vote");
      return;
    }

    const currentVote = userVotes.get(editId);
    const isRemoving = (vote === 'upvote' && currentVote === 1) ||
      (vote === 'downvote' && currentVote === -1);

    voteMutation.mutate({
      editId,
      vote: isRemoving ? 'remove' : vote
    });
  };

  const handleCreateEdit = () => {
    if (!isLoggedIn) {
      alert("Please log in to create an edit");
      return;
    }

    // Check if user has an existing edit
    if (userEditData?.edit) {
      // If their edit is chosen, they can create another one
      if (!userEditData.edit.isChosen) {
        // User has a non-chosen edit - show policy dialog
        setShowPolicyDialog(true);
        return;
      }
    }

    // Open edit form for creating a new edit
    setEditingExisting(false);
    setShowEditForm(true);
  };

  const rawEdits = editsData?.edits || [];
  const edits = [...rawEdits].sort((a, b) => {
    if (a.userId === session?.user?.id) return -1;
    if (b.userId === session?.user?.id) return 1;
    return 0;
  });
  const userVotes = new Map(votesData?.votes.map(v => [v.editId, v.vote]) || []);

  // Check if there are any edits by other users (not the current user)
  const hasEditsFromOtherUsers = rawEdits.some(e => e.userId !== session?.user?.id);

  const isLoading = isRefetchingEdits || isRefetchingVotes || voteMutation.isPending;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-card">
          <VisuallyHidden>
            <DrawerTitle>Arcade Edits</DrawerTitle>
            <DrawerDescription>View and vote on arcade edits</DrawerDescription>
          </VisuallyHidden>
          <div className="relative px-4 pt-4 pb-8 max-w-2xl mx-auto w-full max-h-[80vh] overflow-y-auto">
            {/* Loading Overlay */}
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Loading...</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Content */}
            <div className={isLoading ? "opacity-50 pointer-events-none" : ""}>
              <h3 className="font-semibold text-lg mb-4">Arcade Edits</h3>

              {edits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No edits yet. Be the first to contribute!
                </p>
              ) : (
                <div className="space-y-2 mb-4">
                  {edits.map((edit) => {
                    const isExpanded = expandedEditId === edit.id;
                    const gamesCount = edit.games ? Object.keys(edit.games).length : 0;
                    const gameSummary = edit.games ? Object.entries(edit.games)
                      .slice(0, 2)
                      .map(([game, data]: [string, any]) => `${data.amount || ""}x ${game}`)
                      .join(", ") : "";

                    return (
                      <div
                        key={edit.id}
                        className={`border rounded-lg transition-all ${isExpanded ? 'bg-accent/5' : 'hover:bg-accent'}`}
                      >
                        <div
                          className="p-3 cursor-pointer"
                          onClick={() => setExpandedEditId(isExpanded ? null : edit.id)}
                        >
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">{edit.name || store?.name}</p>
                                {edit.isChosen && (
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                    <Crown className="h-3 w-3" />
                                    <span className="text-xs font-medium">Chosen</span>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">By {edit.userName}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium">{edit.voteCount}</span>
                              <ThumbsUp className="h-3 w-3" />
                            </div>
                          </div>
                          {!isExpanded && gameSummary && (
                            <p className="text-xs text-muted-foreground">
                              {gameSummary}
                              {gamesCount > 2 && ` + ${gamesCount - 2} more`}
                            </p>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 border-t pt-3">
                            <div className="mb-4 flex items-center justify-between">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Created on {new Date(edit.createdAt).toLocaleDateString()}
                                </p>
                              </div>
                            </div>

                            <StoreEditDetails
                              edit={edit}
                              storeName={store?.name || ""}
                              storeAddress={store?.address || ""}
                            />

                            <div className="mt-4 flex gap-2 justify-end">
                              {isLoggedIn && edit.userId === session?.user?.id && (!edit.isChosen || !hasEditsFromOtherUsers) && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingExisting(true);
                                      setShowEditForm(true);
                                    }}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditToDelete(edit.id);
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                              {isLoggedIn && (
                                <>
                                  <Button
                                    variant={userVotes.get(edit.id) === 1 ? "default" : "outline"}
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVote(edit.id, 'upvote');
                                    }}
                                  >
                                    <ThumbsUp className="h-4 w-4 mr-2" />
                                    {userVotes.get(edit.id) === 1 ? "Upvoted" : "Upvote"}
                                  </Button>
                                  <Button
                                    variant={userVotes.get(edit.id) === -1 ? "default" : "outline"}
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleVote(edit.id, 'downvote');
                                    }}
                                  >
                                    <ThumbsDown className="h-4 w-4 mr-2" />
                                    {userVotes.get(edit.id) === -1 ? "Downvoted" : "Downvote"}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button className="w-full" onClick={handleCreateEdit}>
                Create Edit
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={!!editToDelete} onOpenChange={(open) => !open && setEditToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Edit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete your edit? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setEditToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (editToDelete) {
                  deleteMutation.mutate({ editId: editToDelete });
                  setEditToDelete(null);
                }
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Policy</AlertDialogTitle>
            <AlertDialogDescription>
              You can only have one edit per arcade unless your edit becomes the chosen one (the highest voted edit).
              {userEditData?.edit && (
                <>
                  <br /><br />
                  You already have an edit for this arcade. Please edit or delete your existing edit before creating a new one.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setShowPolicyDialog(false)}>
              Close
            </Button>
            {userEditData?.edit && (
              <Button onClick={() => {
                setShowPolicyDialog(false);
                setEditingExisting(true);
                setShowEditForm(true);
              }}>
                Edit My Submission
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StoreEditForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        store={store}
        existingEdit={editingExisting ? userEditData?.edit : null}
      />
    </>
  );
}

