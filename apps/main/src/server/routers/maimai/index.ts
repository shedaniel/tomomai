import { router } from "@/lib/trpc";
import { dbRouter } from "./db";
import { percentileRouter } from "./percentile";
import { platesRouter } from "./plates";
import { providersRouter } from "./providers";
import { snapshotToolsRouter } from "./snapshot-tools";

export const maimaiRouter = router({
  // Plates
  getPlateSongs: platesRouter.getPlateSongs,
  getPublicPlateSongs: platesRouter.getPublicPlateSongs,

  // Percentile
  getChartPercentiles: percentileRouter.getChartPercentiles,
  getRecommendationPeers: percentileRouter.getRecommendationPeers,

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
