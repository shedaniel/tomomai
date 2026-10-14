"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EyeOff, Loader2, User, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Switch,
} from "@tomomai/ui";
import { Link } from "@/i18n/navigation";
import { useGame } from "@/components/providers/game-provider";
import { useLocale } from "@/components/providers/locale-provider";
import { SettingsField, SettingsHeader, SettingsSection } from "@/components/settings/primitives";
import { formatGameRating } from "@/lib/games/presentation";
import { isR2Url, resolveImageUrl } from "@/lib/images";
import { trpc } from "@/lib/trpc-client";
import type { RouterOutputs } from "@/lib/trpc-types";

type Overview = RouterOutputs["user"]["getFriends"];
type Friend = Overview["friends"][number];
type Hidden = Overview["hidden"][number];

export function FriendsSettings() {
  const t = useTranslations();
  const game = useGame();
  const brand = game.brand.productName;

  return (
    <div>
      <SettingsHeader
        title={t("settings.pages.friends.title")}
        description={t("settings.pages.friends.description", { brand })}
      />
      <FriendsBody />
    </div>
  );
}

function FriendsBody() {
  const t = useTranslations("settings.friends");
  const tc = useTranslations("common");
  const game = useGame();
  const { locale } = useLocale();
  const brand = game.brand.productName;
  const utils = trpc.useUtils();
  const [confirmOff, setConfirmOff] = useState(false);
  const [hideTarget, setHideTarget] = useState<Friend | null>(null);

  const { data, isLoading } = trpc.user.getFriends.useQuery({ game: game.id }, { refetchOnWindowFocus: false });

  const refresh = () => utils.user.getFriends.invalidate();
  const onError = () => toast.error(t("error"));
  const setEnabled = trpc.user.setFriendsEnabled.useMutation({ onSuccess: refresh, onError });
  const hide = trpc.user.hideFriend.useMutation({ onSuccess: () => { setHideTarget(null); return refresh(); }, onError });
  const unhide = trpc.user.unhideFriends.useMutation({ onSuccess: refresh, onError });

  if (isLoading || !data) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tc("loading")}
      </div>
    );
  }

  const lastSynced = data.synced.reduce<Date | null>((latest, { syncedAt }) => !latest || syncedAt > latest ? syncedAt : latest, null);

  return (
    <div className="grid gap-6">
      <SettingsField
        layout="inline"
        icon={Users}
        htmlFor="friends-enabled"
        label={t("matching.label")}
        description={t("matching.description", { game: game.brand.displayName })}
        action={
          <Switch
            id="friends-enabled"
            checked={data.enabled}
            disabled={setEnabled.isPending}
            onCheckedChange={enabled => enabled ? setEnabled.mutate({ enabled }) : setConfirmOff(true)}
          />
        }
      />

      <SettingsSection className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">{t("listTitle", { count: data.friends.length })}</h2>
          {data.enabled && lastSynced && (
            <span className="text-xs text-muted-foreground">
              {t("lastSynced", { date: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(lastSynced) })}
            </span>
          )}
        </div>

        {!data.enabled ? (
          <EmptyState>{t("off", { brand })}</EmptyState>
        ) : data.friends.length === 0 ? (
          <EmptyState>{lastSynced ? t("empty", { brand }) : t("notSynced", { game: game.brand.displayName })}</EmptyState>
        ) : (
          <ul className="rounded-md border divide-y">
            {data.friends.map(friend => (
              <FriendRow key={friend.userId} friend={friend} onHide={() => setHideTarget(friend)} />
            ))}
          </ul>
        )}
      </SettingsSection>

      {data.hidden.length > 0 && (
        <SettingsSection className="grid gap-3">
          <div className="grid gap-1">
            <h2 className="text-sm font-medium">{t("hidden.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hidden.description")}</p>
          </div>
          <ul className="rounded-md border divide-y">
            {data.hidden.map(person => (
              <HiddenRow
                key={person.userId}
                person={person}
                pending={unhide.isPending && unhide.variables?.userIds.includes(person.userId)}
                onUnhide={() => unhide.mutate({ userIds: [person.userId] })}
              />
            ))}
          </ul>
        </SettingsSection>
      )}

      <AlertDialog open={confirmOff} onOpenChange={setConfirmOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("disable.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("disable.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOff(false);
                setEnabled.mutate({ enabled: false });
              }}
            >
              {t("disable.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hideTarget} onOpenChange={open => !open && setHideTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hideTitle", { name: hideTarget?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("hideDescription", { brand })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={hide.isPending}
              onClick={event => {
                event.preventDefault();
                if (hideTarget) hide.mutate({ userId: hideTarget.userId });
              }}
            >
              {t("hide")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
      <Users className="h-5 w-5" />
      <p className="max-w-sm text-pretty">{children}</p>
    </div>
  );
}

function Avatar({ src, label }: { src: string | null; label: string }) {
  if (!src) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
        <User className="h-4 w-4" />
      </span>
    );
  }
  return (
    <Image
      src={src}
      alt={label}
      width={40}
      height={40}
      className="size-10 shrink-0 rounded-full bg-muted object-cover"
      unoptimized={isR2Url(src)}
    />
  );
}

function FriendRow({ friend, onHide }: { friend: Friend; onHide: () => void }) {
  const t = useTranslations("settings.friends");
  const game = useGame();
  const { player } = friend;

  const identity = (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar src={player ? resolveImageUrl(player.iconUrl) : friend.image} label={friend.name} />
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{player?.displayName ?? friend.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {friend.username ? `@${friend.username}` : t("notShared")}
        </span>
      </div>
    </div>
  );

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      {friend.username ? (
        <Link
          href={`/profile/${encodeURIComponent(friend.username)}${player ? `/${player.region}` : ""}`}
          className="min-w-0 rounded-md outline-offset-4 transition-opacity hover:opacity-80"
        >
          {identity}
        </Link>
      ) : identity}
      <div className="flex shrink-0 items-center gap-2">
        {player && (
          <Badge variant="tonal" className="font-medium tabular-nums">{formatGameRating(game.id, player.rating)}</Badge>
        )}
        {game.regions.length > 1 && friend.regions.map(region => (
          <span key={region} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{region.toUpperCase()}</span>
        ))}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onHide} title={t("hide")} aria-label={t("hide")}>
          <EyeOff className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function HiddenRow({ person, pending, onUnhide }: { person: Hidden; pending?: boolean; onUnhide: () => void }) {
  const t = useTranslations("settings.friends");
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={person.image} label={person.name} />
        <span className="truncate text-sm">{person.name}</span>
      </div>
      <Button variant="outline" size="sm" onClick={onUnhide} disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("unhide")}
      </Button>
    </li>
  );
}
