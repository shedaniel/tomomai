import { protectedProcedure, publicProcedure, router } from '@/lib/trpc';
import { db } from '@/lib/db';
import { policyAcceptance } from '@/lib/db/schema-pg';
import {
  getCurrentLegalVersions,
  getLegalDocument,
  getConsentStatus,
  type ConsentStatus,
  type LegalType,
} from '@/lib/legal';
import { getAcceptedPolicyVersions } from '@/lib/legal-acceptance';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

const LEGAL_TYPES: LegalType[] = ['tos', 'privacy'];

export const legalRouter = router({
  // Public: serve current policy content + version for the signup consent dialog.
  getPolicies: publicProcedure.query(async () => {
    const tos = getLegalDocument('tos');
    const privacy = getLegalDocument('privacy');
    return {
      tos: { content: tos?.content ?? '', version: tos?.version ?? '' },
      privacy: { content: privacy?.content ?? '', version: privacy?.version ?? '' },
    };
  }),

  // Protected: compute per-doc consent status (ok / soft / hard) for the gate.
  getPendingConsents: protectedProcedure.query(async ({ ctx }) => {
    const accepted = await getAcceptedPolicyVersions(ctx.session.user.id);
    const now = new Date();
    const statuses: ConsentStatus[] = LEGAL_TYPES.map((type) =>
      getConsentStatus(type, accepted[type], now),
    );
    const currentVersions = getCurrentLegalVersions();
    return {
      statuses,
      currentVersions,
      blocking: statuses.some((s) => s.level === 'hard'),
    };
  }),

  // Protected: record acceptance of the current versions. Validates the
  // submitted versions against the server's current set so a client cannot
  // record acceptance of a version that is not actually published.
  acceptPolicies: protectedProcedure
    .input(
      z.object({
        versions: z.object({
          tos: z.string(),
          privacy: z.string(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const current = getCurrentLegalVersions();
      if (
        input.versions.tos !== current.tos ||
        input.versions.privacy !== current.privacy
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Policy version mismatch, please reload.',
        });
      }

      const now = new Date();
      const userId = ctx.session.user.id;
      // Append-only: each acceptance inserts new audit rows. getPendingConsents
      // reads MAX(version) per doc type, so superseded rows are ignored.
      await db.insert(policyAcceptance).values([
        { userId, docType: 'tos', version: current.tos, acceptedAt: now },
        { userId, docType: 'privacy', version: current.privacy, acceptedAt: now },
      ]);

      return { ok: true };
    }),
});
