import { publicProcedure, router } from '@/lib/trpc';
import { flagDefinitions } from '@/lib/flags';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const miscRouter = router({
  getUserSelectableFlags: publicProcedure
    .query(async () => {
      const selectableFlags: Record<string, any> = {};
      for (const [key, def] of Object.entries(flagDefinitions)) {
        if (def.userSelectable) {
          selectableFlags[key] = def;
        }
      }
      return { flags: selectableFlags };
    }),

  getLxnsOAuthConfigured: publicProcedure
    .query(async () => {
      return {
        configured: !!process.env.LXNS_CLIENT_ID && !!process.env.LXNS_CLIENT_SECRET,
      };
    }),

  getPolicies: publicProcedure
    .query(async () => {
      const tosPath = join(process.cwd(), 'public', 'tos');
      const privacyPath = join(process.cwd(), 'public', 'privacy');

      const [tosContent, privacyContent] = await Promise.all([
        readFile(tosPath, 'utf-8'),
        readFile(privacyPath, 'utf-8'),
      ]);

      return {
        tos: { content: tosContent },
        privacy: { content: privacyContent },
      };
    }),
});
