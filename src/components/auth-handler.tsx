"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { showMessage } from "@/components/imperative-dialog";

export function AuthHandler() {
  const searchParams = useSearchParams();

  // Handle Better Auth error redirects and invitation success
  useEffect(() => {
    const error = searchParams.get('error');

    if (error) {
      let errorMessage: string | null = null;

      switch (error) {
        case 'unable_to_create_user':
          errorMessage = "Sign up is currently disabled. Only existing users can log in.";
          break;
        case 'auth_error':
          errorMessage = "An error occurred during authentication. Please try again.";
          break;
        case 'signup_disabled':
          errorMessage = "Sign up disabled or no account found, please first sign up!";
          break;
        case 'unable_to_get_user_info':
          errorMessage = "Failed to get your user info!";
          break;
        default:
          errorMessage = error;
          break;
      }

      if (errorMessage) {
        showMessage({
          title: "Authentication error",
          description: errorMessage,
          label: "OK",
          dedupKey: `auth-error:${error}`,
        });
        // Clean up the URL
        window.history.replaceState({}, '', '/');
      }
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
