import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema-pg";

export type SignupType = "disabled" | "invite-only" | "enabled";

export const SIGNUP_TYPE: SignupType = (() => {
  const raw = process.env.NEXT_PUBLIC_ACCOUNT_SIGNUP_TYPE;
  return raw === "enabled" || raw === "invite-only" ? raw : "disabled";
})();

// In invite-only mode, signup stays open until this many accounts exist.
const OPEN_SIGNUP_USER_LIMIT = 128;

export interface SignupRequirements {
  signupEnabled: boolean;
  inviteRequired: boolean;
  reason: "disabled" | "invite-only" | "enabled" | "open";
}

export async function getSignupRequirements(): Promise<SignupRequirements> {
  if (SIGNUP_TYPE === "disabled") {
    return { signupEnabled: false, inviteRequired: false, reason: "disabled" };
  }
  if (SIGNUP_TYPE === "enabled") {
    return { signupEnabled: true, inviteRequired: false, reason: "enabled" };
  }

  const [userCount] = await db.select({ count: count() }).from(user);
  const inviteRequired = userCount.count >= OPEN_SIGNUP_USER_LIMIT;
  return {
    signupEnabled: true,
    inviteRequired,
    reason: inviteRequired ? "invite-only" : "open",
  };
}
