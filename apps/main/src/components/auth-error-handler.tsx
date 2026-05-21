"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { showMessage } from "@/components/imperative-dialog";

const ERROR_MESSAGES: Record<string, string> = {
  unable_to_create_user:
    "Sign up is currently disabled. Only existing users can log in.",
  auth_error: "An error occurred during authentication. Please try again.",
  signup_disabled:
    "Sign up disabled or no account found, please first sign up!",
  unable_to_get_user_info: "Failed to get your user info!",
  "email_doesn't_match":
    "That account's email doesn't match your current account.",
  account_already_linked_to_different_user:
    "That account is already linked to a different user.",
  account_not_linked:
    "That provider account isn't linked to your user and couldn't be linked automatically.\n\nYou may already have an account using the same email.\n\nTry signing in with the provider you originally signed up with, then link this one from Settings → Account.",
};

function describeError(code: string): string {
  return ERROR_MESSAGES[code] ?? code.replaceAll("_", " ");
}

/**
 * Reads `?error=<code>` from the URL (Better Auth's `errorCallbackURL`
 * convention), shows it via the imperative dialog, then strips the param
 * while preserving the current path and any unrelated query params.
 *
 * Drop this in once per page that is a target of an `errorCallbackURL`.
 */
export function AuthErrorHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;

    showMessage({
      title: "Authentication error",
      description: describeError(error),
      label: "OK",
      dedupKey: `auth-error:${error}`,
    });

    const next = new URLSearchParams(searchParams);
    next.delete("error");
    const qs = next.toString();
    window.history.replaceState({}, "", qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname]);

  return null;
}
