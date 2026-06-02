"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc-client";
import { policyGuard } from "./policy-guard-client";

export interface UseNewPolicyGuardOptions {
  required: { tos: string; privacy: string };
}

/**
 * Hook wrapper around `policyGuard` that injects tRPC bindings (read accepted
 * versions, fetch policy content, record acceptance) and `consent.*` strings.
 * Spread into a mutation, composing with `useReauthGuard` via `composeGuards`:
 *
 *   const m = useMutation({
 *     mutationFn,
 *     ...composeGuards(useNewPolicyGuard({ required }), useReauthGuard({ ... })),
 *   });
 */
export function useNewPolicyGuard(opts: UseNewPolicyGuardOptions) {
  const t = useTranslations("consent");
  const utils = trpc.useUtils();
  const acceptMutation = trpc.user.acceptPolicies.useMutation();

  return policyGuard({
    required: opts.required,
    getAccepted: async () => {
      const data = await utils.user.getPendingConsents.fetch();
      const tos = data.statuses.find((s) => s.docType === "tos")?.accepted ?? null;
      const privacy = data.statuses.find((s) => s.docType === "privacy")?.accepted ?? null;
      return { tos, privacy };
    },
    getPolicies: async () => {
      const data = await utils.user.getPolicies.fetch();
      return { tos: data.tos, privacy: data.privacy };
    },
    acceptPolicies: async (versions) => {
      await acceptMutation.mutateAsync({ versions });
      await utils.user.getPendingConsents.invalidate();
    },
    strings: {
      title: t("gatePrompt.title"),
      description: t("gatePrompt.description"),
      agreeTosLabel: t("agreeToTos"),
      agreePrivacyLabel: t("agreeToPrivacy"),
      viewFullTextLabel: t("viewFullText"),
      confirmLabel: t("gatePrompt.confirm"),
      cancelLabel: t("cancel"),
      retryMessage: t("gatePrompt.retry"),
    },
  });
}
