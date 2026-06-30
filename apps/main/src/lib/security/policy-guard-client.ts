"use client";

import { toast } from "sonner";
import { showPolicyConsent } from "@/components/imperative-consent";
import { isNewPolicyError } from "./policy-gate";

const POLICY_LOCAL_ABORT = "__new_policy_local_abort__";

export interface PolicyGuardStrings {
  title: string;
  description: string;
  agreeTosLabel: string;
  agreePrivacyLabel: string;
  viewFullTextLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Toast shown after the user accepts via the onError path, prompting a retry. */
  retryMessage: string;
}

export interface PolicyGuardOptions {
  required: { tos: string; privacy: string };
  /** Read the user's currently accepted versions (null = never accepted). */
  getAccepted: () => Promise<{ tos: string | null; privacy: string | null }>;
  /** Fetch current policy content + versions to display. */
  getPolicies: () => Promise<{
    tos: { content: string; version: string };
    privacy: { content: string; version: string };
  }>;
  /** Record acceptance of the given current versions. */
  acceptPolicies: (versions: { tos: string; privacy: string }) => Promise<void>;
  strings: PolicyGuardStrings;
}

function behind(
  accepted: { tos: string | null; privacy: string | null },
  required: { tos: string; privacy: string },
): boolean {
  return (accepted.tos ?? "") < required.tos || (accepted.privacy ?? "") < required.privacy;
}

/**
 * Returns mutation-hook handlers that gate an action behind acceptance of a
 * required policy version. Mirrors `reauthGuard`: `onMutate` pre-flights so the
 * side-effecting action (e.g. the WebAuthn prompt) never half-fires on a stale
 * policy; `onError` is the belt-and-braces path for the direct-HTTP / cross-tab
 * case. Compose with `reauthGuard` via `composeGuards` (policy first).
 *
 * onError returns `true` when it handled the error so a composed terminal guard
 * does not also toast.
 */
export function policyGuard(opts: PolicyGuardOptions) {
  const runConsentFlow = async (): Promise<boolean> => {
    const policies = await opts.getPolicies();
    const accepted = await showPolicyConsent({
      title: opts.strings.title,
      description: opts.strings.description,
      tosContent: policies.tos.content,
      privacyContent: policies.privacy.content,
      agreeTosLabel: opts.strings.agreeTosLabel,
      agreePrivacyLabel: opts.strings.agreePrivacyLabel,
      viewFullTextLabel: opts.strings.viewFullTextLabel,
      confirmLabel: opts.strings.confirmLabel,
      cancelLabel: opts.strings.cancelLabel,
    });
    if (!accepted) return false;
    await opts.acceptPolicies({ tos: policies.tos.version, privacy: policies.privacy.version });
    return true;
  };

  return {
    onMutate: async () => {
      const accepted = await opts.getAccepted();
      if (behind(accepted, opts.required)) {
        const ok = await runConsentFlow();
        if (!ok) throw new Error(POLICY_LOCAL_ABORT);
      }
    },
    onError: async (err: { message?: string }): Promise<boolean> => {
      if (err.message === POLICY_LOCAL_ABORT) return true; // already handled in onMutate
      if (isNewPolicyError(err)) {
        const ok = await runConsentFlow();
        if (ok) toast.error(opts.strings.retryMessage);
        return true;
      }
      return false; // not ours — let a composed guard handle it
    },
  };
}
