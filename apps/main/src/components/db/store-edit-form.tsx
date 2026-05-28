"use client";

import { useState, useEffect } from "react";
import { Button } from "@tomomai/ui";
import { Input } from "@tomomai/ui";
import { Label } from "@tomomai/ui";
import { Textarea } from "@tomomai/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@tomomai/ui";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@tomomai/ui";
import { Switch } from "@tomomai/ui";
import { X, Plus, CheckCircle, XCircle, PauseCircle } from "lucide-react";
import { trpc } from "@/lib/trpc-client";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { getAllGames, GAMES } from "@/lib/game-utils";

interface Store {
  id: bigint;
  country: string;
  area: string | null;
  name: string;
  address: string;
}

interface StoreEditFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  existingEdit?: any | null;
}

const CURRENCY_MAP: Record<string, string> = {
  "Taiwan": "NT$",
  "Hong Kong": "HK$",
  "Singapore": "S$",
  "Malaysia": "RM",
  "Korea": "₩",
  "Thailand": "฿",
  "Macau": "MOP$",
  "USA": "US$",
  "Philippines": "₱",
  "Viet Nam": "₫",
  "Australia": "A$",
  "Myanmar": "K",
  "New Zealand": "NZ$",
  "Japan": "¥",
};



interface GameData {
  amount: number;
  price: number;
}

export function StoreEditForm({ open, onOpenChange, store, existingEdit }: StoreEditFormProps) {
  const t = useTranslations();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [toilet, setToilet] = useState<boolean | null>(null);
  const [smoke, setSmoke] = useState<boolean | null>(null);
  const [access, setAccess] = useState("");
  const [status, setStatus] = useState<"open" | "closed" | "temporarily_closed">("open");
  const [currency, setCurrency] = useState("");
  const [games, setGames] = useState<Record<string, GameData>>({});
  const [showCurrencyHint, setShowCurrencyHint] = useState(false);
  const utils = trpc.useUtils();

  // Get localized game list
  const localizedGames = getAllGames((k: string) => t.has(k) ? t(k) : k);

  // Auto-fill currency based on country
  useEffect(() => {
    if (store && open) {
      const defaultCurrency = CURRENCY_MAP[store.country];
      if (defaultCurrency) {
        setCurrency(defaultCurrency);
        setShowCurrencyHint(false);
      } else {
        setCurrency("");
        setShowCurrencyHint(true);
      }
    }
  }, [store, open]);

  // Load existing edit data
  useEffect(() => {
    if (existingEdit && open) {
      setName(existingEdit.name || "");
      setAddress(existingEdit.address || "");
      setOpeningHours(existingEdit.openingHours || "");
      setToilet(existingEdit.toilet);
      setSmoke(existingEdit.smoke);
      setAccess(existingEdit.access || "");
      setStatus(existingEdit.status || "open");
      setCurrency(existingEdit.currency || "");
      setGames(existingEdit.games || {});
    } else if (store && open && !existingEdit) {
      // Reset form for new edit
      setName(store.name);
      setAddress(store.address);
      setOpeningHours("");
      setToilet(null);
      setSmoke(null);
      setAccess("");
      setStatus("open");
      setGames({});
    }
  }, [existingEdit, store, open]);

  const createEditMutation = trpc.store.createStoreEdit.useMutation({
    onSuccess: () => {
      toast.success("Edit submitted successfully!");
      onOpenChange(false);
      // Invalidate relevant queries
      utils.store.getStoreEdits.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getUserStoreEdit.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getStores.invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message || "Failed to submit edit");
    },
  });

  const updateEditMutation = trpc.store.updateStoreEdit.useMutation({
    onSuccess: () => {
      toast.success("Edit updated successfully!");
      onOpenChange(false);
      utils.store.getStoreEdits.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getUserStoreEdit.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getStores.invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message || "Failed to update edit");
    },
  });

  const deleteEditMutation = trpc.store.deleteStoreEdit.useMutation({
    onSuccess: () => {
      toast.success("Edit deleted successfully!");
      onOpenChange(false);
      utils.store.getStoreEdits.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getUserStoreEdit.invalidate({ storeId: store?.id || BigInt(0) });
      utils.store.getStores.invalidate();
    },
    onError: (error) => {
      console.error(error);
      toast.error(error.message || "Failed to delete edit");
    },
  });

  const handleAddGame = (game: string) => {
    if (!games[game]) {
      setGames({ ...games, [game]: { amount: 0, price: 0 } });
    }
  };

  const handleRemoveGame = (game: string) => {
    const newGames = { ...games };
    delete newGames[game];
    setGames(newGames);
  };

  const handleGameChange = (game: string, field: "amount" | "price", value: string | number) => {
    setGames({
      ...games,
      [game]: { ...games[game], [field]: value },
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (name.length < 1 || name.length > 32) {
      toast.error("Name must be between 1 and 32 characters");
      return;
    }

    if (address.length < 10 || address.length > 256) {
      toast.error("Address must be between 10 and 256 characters");
      return;
    }

    if (!currency) {
      toast.error("Currency is required");
      return;
    }

    // Convert games data to proper format (filter out empty entries)
    const gamesData: Record<string, { amount?: number; price?: number }> = {};
    Object.entries(games).forEach(([game, data]) => {
      if (data.amount || data.price) {
        gamesData[game] = {
          ...(data.amount ? { amount: data.amount } : {}),
          ...(data.price ? { price: data.price } : {}),
        };
      }
    });

    const editData = {
      storeId: store!.id,
      name: name || null,
      address: address || null,
      openingHours: openingHours || null,
      toilet,
      smoke,
      access: access || null,
      status,
      currency,
      games: Object.keys(gamesData).length > 0 ? gamesData : null,
    };

    if (existingEdit) {
      updateEditMutation.mutate({
        editId: existingEdit.id,
        ...editData,
      });
    } else {
      createEditMutation.mutate(editData);
    }
  };

  const handleDelete = () => {
    if (!existingEdit) return;
    if (confirm("Are you sure you want to delete your edit?")) {
      deleteEditMutation.mutate({ editId: existingEdit.id });
    }
  };

  const isLoading = createEditMutation.isPending || updateEditMutation.isPending || deleteEditMutation.isPending;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-card">
        <VisuallyHidden>
          <DrawerTitle>{existingEdit ? "Edit" : "Create"} Arcade Data</DrawerTitle>
          <DrawerDescription>Submit your arcade information</DrawerDescription>
        </VisuallyHidden>
        <div className="px-4 pt-4 pb-8 max-w-2xl mx-auto w-full max-h-[80vh] overflow-y-auto">
          <h3 className="font-semibold text-lg mb-4">
            {existingEdit ? "Edit" : "Create"} Arcade Data
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="mb-2">Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Arcade name"
                maxLength={32}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">Max 32 characters. Please use the local language.</p>
            </div>

            <div>
              <Label htmlFor="address" className="mb-2">Address *</Label>
              <Textarea
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Full address"
                minLength={10}
                maxLength={256}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">10-256 characters. Please use the local language.</p>
            </div>

            <div>
              <Label htmlFor="currency" className="mb-2">Currency *</Label>
              {showCurrencyHint && (
                <p className="text-xs text-muted-foreground mb-1">
                  Examples: HK$, US$, ₩, ¥, etc.
                </p>
              )}
              <Input
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="Currency symbol"
                required
              />
            </div>

            <div>
              <Label htmlFor="status" className="mb-2">Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as "open" | "closed" | "temporarily_closed")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>Open</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="temporarily_closed">
                    <div className="flex items-center gap-2">
                      <PauseCircle className="h-4 w-4 text-yellow-500" />
                      <span>Temporarily Closed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="closed">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span>Closed</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="openingHours" className="mb-2">Opening Hours</Label>
              <Textarea
                id="openingHours"
                value={openingHours}
                onChange={(e) => setOpeningHours(e.target.value)}
                placeholder="e.g., Mon-Fri: 10:00-22:00&#10;Sat-Sun: 10:00-00:00"
                rows={3}
              />
            </div>

            <div>
              <Label htmlFor="access" className="mb-2">How to Access</Label>
              <Textarea
                id="access"
                value={access}
                onChange={(e) => setAccess(e.target.value)}
                placeholder="Directions or access instructions"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label>Toilet Available</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={toilet === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setToilet(true)}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={toilet === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setToilet(false)}
                >
                  No
                </Button>
                <Button
                  type="button"
                  variant={toilet === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setToilet(null)}
                >
                  N/A
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Smoking Allowed</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={smoke === true ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSmoke(true)}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={smoke === false ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSmoke(false)}
                >
                  No
                </Button>
                <Button
                  type="button"
                  variant={smoke === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSmoke(null)}
                >
                  N/A
                </Button>
              </div>
            </div>

            <div>
              <Label className="mb-2">Available Games</Label>
              <Select onValueChange={handleAddGame}>
                <SelectTrigger>
                  <SelectValue placeholder="Add a game" />
                </SelectTrigger>
                <SelectContent>
                  {localizedGames.filter(g => !games[g.id]).map(game => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {Object.keys(games).length > 0 && (
                <div className="mt-3 space-y-2">
                  {Object.entries(games).map(([game, data]) => (
                    <div key={game} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{localizedGames.find(g => g.id === game)?.name || game}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleRemoveGame(game)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Amount</Label>
                          <Input
                            type="number"
                            placeholder="# of cabs"
                            value={data.amount}
                            onChange={(e) => e.target.value ? handleGameChange(game, "amount", parseInt(e.target.value)) : null}
                            min="0"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Price</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                              {currency || "$"}
                            </span>
                            <Input
                              type="number"
                              placeholder="100"
                              value={data.price}
                              onChange={(e) => e.target.value ? handleGameChange(game, "price", parseFloat(e.target.value)) : null}
                              className="pl-12"
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              {existingEdit && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  Delete
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="flex-1">
                {isLoading ? "Saving..." : existingEdit ? "Update" : "Submit"}
              </Button>
            </div>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
