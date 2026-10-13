"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAccount } from "./AccountProvider";

/** Reports the `?signin=` outcome the OAuth callback appends, then drops it from the URL. */
export function SignInToast() {
  const t = useTranslations("guess.account");
  const { viewer } = useAccount();

  useEffect(() => {
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("signin");
    if (!outcome) return;
    url.searchParams.delete("signin");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    if (outcome === "ok") {
      toast.success(
        viewer ? t("signedInAs", { name: viewer.name }) : t("signedIn"),
      );
    } else if (outcome === "cancelled") {
      toast(t("signInCancelled"));
    } else {
      toast.error(t("signInFailed"));
    }
    // Runs once per landing; the viewer is already hydrated from the layout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
