"use client";

import { Button, Label, DiscordIcon, XIcon } from "@tomomai/ui";
import { Link2, Loader2, Link2Off } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { reauthGuard } from "@/lib/security/fresh-session-client";
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
    ...reauthGuard({
      callbackURL: "/settings",
      reauthMessage: t("reauthRequired"),
      fallback: t("unlinkError"),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["linked-accounts"] });
      toast.success(t("unlinkSuccess"));
    },
  });

  const linkMutation = useMutation({
    mutationFn: async (providerId: "discord" | "twitter") => {
      await authClient.linkSocial({ provider: providerId, callbackURL: "/settings" });
    },
    ...reauthGuard({
      callbackURL: "/settings",
      reauthMessage: t("reauthRequired"),
      fallback: t("linkError"),
    }),
  });

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
            const isLinking = linkMutation.isPending && linkMutation.variables === id;

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
                    onClick={() => linkMutation.mutate(id)}
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
