import { router } from "@/lib/trpc";
import { creditsRouter } from "./credits";
import { dbRouter } from "./db";
import { percentileRouter } from "./percentile";
import { platesRouter } from "./plates";
import { providersRouter } from "./providers";
import { snapshotToolsRouter } from "./snapshot-tools";

export const maimaiRouter = router({
  // Plates
  getPlateSongs: platesRouter.getPlateSongs,
  getPublicPlateSongs: platesRouter.getPublicPlateSongs,

  // Credits
  getCredits: creditsRouter.getCredits,
  getPublicCredits: creditsRouter.getPublicCredits,
  getCredit: creditsRouter.getCredit,
  getPublicCredit: creditsRouter.getPublicCredit,

  // Percentile
  getChartPercentiles: percentileRouter.getChartPercentiles,

  // Catalog database
  getEvents: dbRouter.getEvents,
  getEventStepsByNames: dbRouter.getEventStepsByNames,
  getCatalogStats: dbRouter.getCatalogStats,
  getTopSongs: dbRouter.getTopSongs,

  // Snapshot tools
  exportSnapshotData: snapshotToolsRouter.exportSnapshotData,
  getAvailableVersionsForCopy: snapshotToolsRouter.getAvailableVersionsForCopy,
  copySnapshotToVersion: snapshotToolsRouter.copySnapshotToVersion,

  // Score providers
  getLxnsOAuthConfigured: providersRouter.getLxnsOAuthConfigured,
  getCnProxyConfigured: providersRouter.getCnProxyConfigured,
  getCnProxyAuthLink: providersRouter.getCnProxyAuthLink,
  getDivingFishConfigured: providersRouter.getDivingFishConfigured,
  getDivingFishNicknameChallenge: providersRouter.getDivingFishNicknameChallenge,
  verifyDivingFishImportToken: providersRouter.verifyDivingFishImportToken,
  verifyDivingFishNickname: providersRouter.verifyDivingFishNickname,
});
