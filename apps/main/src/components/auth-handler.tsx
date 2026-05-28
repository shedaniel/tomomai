"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AuthErrorHandler } from "@/components/auth-error-handler";

export function AuthHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("error")) return;

    const cookies = document.cookie.split(";").reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies.pendingInviteCode) {
      document.cookie = "pendingInviteCode=; path=/; max-age=0";
      toast.success("Welcome! Your invitation has been claimed successfully.");
    }
  }, [searchParams]);

  return <AuthErrorHandler />;
}
