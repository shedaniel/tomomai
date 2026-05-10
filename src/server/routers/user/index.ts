import { router } from '@/lib/trpc';
import { snapshotsRouter } from './snapshots';
import { profileRouter } from './profile';
import { fetchRouter } from './fetch';
import { invitesRouter } from './invites';
import { recentsRouter } from './recents';
import { statsRouter } from './stats';
import { platesRouter } from './plates';
import { albumsRouter } from './albums';
import { songsRouter } from './songs';
import { miscRouter } from './misc';

export const userRouter = router({
  // Snapshots
  getSnapshots: snapshotsRouter.getSnapshots,
  getRatingHistory: snapshotsRouter.getRatingHistory,
  getSnapshotData: snapshotsRouter.getSnapshotData,
  getPublicSnapshots: snapshotsRouter.getPublicSnapshots,
  getPublicSnapshotData: snapshotsRouter.getPublicSnapshotData,
  deleteSnapshot: snapshotsRouter.deleteSnapshot,
  exportSnapshotData: snapshotsRouter.exportSnapshotData,
  getAvailableVersionsForCopy: snapshotsRouter.getAvailableVersionsForCopy,
  copySnapshotToVersion: snapshotsRouter.copySnapshotToVersion,

  // Profile
  getUserData: profileRouter.getUserData,
  getPublicProfile: profileRouter.getPublicProfile,
  getProfileSettings: profileRouter.getProfileSettings,
  updatePublishProfile: profileRouter.updatePublishProfile,
  updateRegion: profileRouter.updateRegion,
  updateProfileMainRegion: profileRouter.updateProfileMainRegion,
  updateProfilePrivacySettings: profileRouter.updateProfilePrivacySettings,
  setAlbumPreference: profileRouter.setAlbumPreference,

  // Fetch
  getLoginOtp: fetchRouter.getLoginOtp,
  startFetch: fetchRouter.startFetch,
  getFetchStatus: fetchRouter.getFetchStatus,
  getLatestFetchSessionId: fetchRouter.getLatestFetchSessionId,
  deleteToken: fetchRouter.deleteToken,

  // Invites
  getSignupRequirements: invitesRouter.getSignupRequirements,
  getInvites: invitesRouter.getInvites,
  createInvite: invitesRouter.createInvite,
  revokeInvite: invitesRouter.revokeInvite,
  validateInvite: invitesRouter.validateInvite,

  // Recents
  getRecentSongs: recentsRouter.getRecentSongs,
  getPublicRecentSongs: recentsRouter.getPublicRecentSongs,

  // Stats
  getPlayerStats: statsRouter.getPlayerStats,
  getPublicPlayerStats: statsRouter.getPublicPlayerStats,

  // Plates
  getPlateSongs: platesRouter.getPlateSongs,
  getPublicPlateSongs: platesRouter.getPublicPlateSongs,

  // Albums
  getUserAlbums: albumsRouter.getUserAlbums,
  deleteAlbum: albumsRouter.deleteAlbum,

  // Songs
  getAllUniqueSongs: songsRouter.getAllUniqueSongs,
  getSongDetails: songsRouter.getSongDetails,
  getSimpleSongDetails: songsRouter.getSimpleSongDetails,

  // Misc
  getUserSelectableFlags: miscRouter.getUserSelectableFlags,
  getPolicies: miscRouter.getPolicies,
  getLxnsOAuthConfigured: miscRouter.getLxnsOAuthConfigured,
  getCnProxyConfigured: miscRouter.getCnProxyConfigured,
  getCnProxyAuthLink: miscRouter.getCnProxyAuthLink,
  getDivingFishConfigured: miscRouter.getDivingFishConfigured,
  getDivingFishNicknameChallenge: miscRouter.getDivingFishNicknameChallenge,
  verifyDivingFishImportToken: miscRouter.verifyDivingFishImportToken,
  verifyDivingFishNickname: miscRouter.verifyDivingFishNickname,
});
