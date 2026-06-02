import { TRPCError } from "@trpc/server";
import { getAcceptedPolicyVersions } from "@/lib/legal-acceptance";
import { NEW_POLICY_REQUIRED_CODE } from "./policy-gate";

/**
 * Throw NEW_POLICY_REQUIRED if the user has not accepted at least the given
 * policy versions. For tRPC routes that need the same gate the passkey BA paths
 * get in auth.ts hooks.before. Versions are "YYYYMMDD" strings.
 */
export async function requireAcceptedPolicies(
  userId: string,
  required: { tos: string; privacy: string },
): Promise<void> {
  const accepted = await getAcceptedPolicyVersions(userId);
  if ((accepted.tos ?? "") < required.tos || (accepted.privacy ?? "") < required.privacy) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: NEW_POLICY_REQUIRED_CODE,
      cause: { code: NEW_POLICY_REQUIRED_CODE },
    });
  }
}
