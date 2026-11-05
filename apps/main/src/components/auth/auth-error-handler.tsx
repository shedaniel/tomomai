"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { showMessage } from "@/components/imperative-dialog";
import type { OpenAuthDialogOptions } from "@/components/auth/auth-dialog-provider";
import { useGame } from "@/components/providers/game-provider";
import { authClient } from "@/lib/auth-client";
import { readAuthErrorCode, resolveAuthError, stripAuthErrorParams } from "@/lib/auth-errors";

const INVITE_COOKIE = "pendingInviteCode";

function hasCookie(name: string) {
  return document.cookie.split(";").some((c) => c.trim().startsWith(`${name}=`));
}

/**
 * Surfaces Better Auth's `?error=` redirects on any page. Signed-out visitors
 * get the auth dialog with the error inline so they can retry in place;
 * signed-in visitors (e.g. a failed account link) get a message dialog.
 * `error_description` is ignored because anyone can put text in a link.
 */
export function AuthErrorHandler({ openAuthDialog }: { openAuthDialog: (options: OpenAuthDialogOptions) => void }) {
  const searchParams = useSearchParams();
  const t = useTranslations("auth.errors");
  const tc = useTranslations("common");
  const ti = useTranslations("acceptInvitation");
  const { brand } = useGame();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const code = readAuthErrorCode(searchParams);

    if (!code) {
      if (!hasCookie(INVITE_COOKIE)) return;
      void authClient.getSession().then(({ data }) => {
        if (!data?.session) return;
        document.cookie = `${INVITE_COOKIE}=; path=/; max-age=0`;
        toast.success(ti("claimed"));
      });
      return;
    }

    const key = searchParams.toString();
    if (handled.current === key) return;
    handled.current = key;

    const qs = stripAuthErrorParams(searchParams).toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);

    const resolved = resolveAuthError(code);
    if (!resolved) return;
    if (code.startsWith("invite_") && code !== "invite_required") {
      document.cookie = `${INVITE_COOKIE}=; path=/; max-age=0`;
    }
    const message = resolved.messageKey === "generic"
      ? `${t("generic")}\n${t("code", { code })}`
      : t(resolved.messageKey, { brand: brand.productName });

    void authClient.getSession().then(({ data }) => {
      if (data?.session) {
        void showMessage({ title: t("title"), description: message, label: tc("ok"), dedupKey: `auth-error:${code}` });
      } else {
        openAuthDialog({ mode: resolved.panel, error: message });
      }
    });
  }, [searchParams, openAuthDialog, t, tc, ti, brand.productName]);

  return null;
}
