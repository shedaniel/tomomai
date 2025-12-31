"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function AuthHandler() {
  const searchParams = useSearchParams();

  // Handle Better Auth error redirects and invitation success
  useEffect(() => {
    const error = searchParams.get('error');
    const isSignupError = error === 'unable_to_create_user';
    const isAuthError = error === 'auth_error';

    if (isSignupError) {
      toast.error("Sign up is currently disabled. Only existing users can log in.");
      // Clean up the URL
      window.history.replaceState({}, '', '/');
    } else if (isAuthError) {
      toast.error("An error occurred during authentication. Please try again.");
      // Clean up the URL
      window.history.replaceState({}, '', '/');
    } else {
      // Check if there's a pending invitation that was just used
      const cookies = document.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      if (cookies.pendingInviteCode) {
        // Clear the pending invitation cookie
        document.cookie = 'pendingInviteCode=; path=/; max-age=0';
        toast.success("Welcome! Your invitation has been claimed successfully.");
      }
    }
  }, [searchParams]);

  return null;
}
