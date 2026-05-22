"use client";

import { useState } from "react";
import { Button, Label, DiscordIcon, XIcon } from "@tomomai/ui";
import { Link2, Loader2, Link2Off } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";

type Account = {
  id: string;
  accountId: string;
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
  scopes: string[];
};

const PROVIDERS = [
  {
    id: "discord",
    label: "Discord",
    Icon: DiscordIcon,
  },
  {
    id: "twitter",
    label: "X (Twitter)",
    Icon: XIcon,
  },
] as const;

export function LinkedAccountsSection() {
  const t = useTranslations("linkedAccounts");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["linked-accounts"],
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) throw new Error(result.error.message);
      return (result.data ?? []) as Account[];
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const result = await authClient.unlinkAccount({ providerId });
      if (result.error) throw new Error(result.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
      toast.success(t("unlinkSuccess"));
    },
    onError: (err: Error) => {
      toast.error(err.message || t("unlinkError"));
    },
  });

  const handleLink = async (providerId: string) => {
    setLinkingProvider(providerId);
    try {
      // Require a fresh session before attaching a new provider: a stolen
      // cookie alone shouldn't be enough to permanently link an attacker's
      // account.
      const FRESH_SESSION_MS = 5 * 60 * 1000;
      const sessionRes = await authClient.getSession();
      const session = (sessionRes as { data?: { session?: { createdAt?: string | Date } } }).data;
      const createdAtRaw = session?.session?.createdAt;
      const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : 0;
      if (!createdAt || Date.now() - createdAt > FRESH_SESSION_MS) {
        toast.error(t("reauthRequired"));
        setLinkingProvider(null);
        const primary = accounts?.[0]?.providerId;
        if (primary === "discord" || primary === "twitter") {
          await authClient.signIn.social({ provider: primary, callbackURL: "/settings" });
        }
        return;
      }
      await authClient.linkSocial({
        provider: providerId as "discord" | "twitter",
        callbackURL: "/settings",
      });
    } catch {
      toast.error(t("linkError"));
      setLinkingProvider(null);
    }
  };

  const linkedProviderIds = new Set(accounts?.map((a) => a.providerId) ?? []);
  const canUnlink = (accounts?.length ?? 0) > 1;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Label className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          {t("title")}
        </Label>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tc("loading")}
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {PROVIDERS.map(({ id, label, Icon }) => {
            const isLinked = linkedProviderIds.has(id);
            const isUnlinking = unlinkMutation.isPending && unlinkMutation.variables === id;
            const isLinking = linkingProvider === id;

            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">
                    {isLinked ? t("linked") : t("notLinked")}
                  </p>
                </div>
                {isLinked ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unlinkMutation.mutate(id)}
                    disabled={!canUnlink || isUnlinking}
                    title={!canUnlink ? t("cannotUnlinkLast") : undefined}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    {isUnlinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link2Off className="h-4 w-4 mr-1.5" />
                        {t("unlink")}
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLink(id)}
                    disabled={isLinking}
                    className="shrink-0"
                  >
                    {isLinking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Link2 className="h-4 w-4 mr-1.5" />
                        {t("link")}
                      </>
                    )}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
