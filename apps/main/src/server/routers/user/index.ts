import { router } from '@/lib/trpc';
import { snapshotsRouter } from './snapshots';
import { profileRouter } from './profile';
import { profileReportsRouter } from './profile-reports';
import { fetchRouter } from './fetch';
import { invitesRouter } from './invites';
import { recentsRouter } from './recents';
import { statsRouter } from './stats';
import { albumsRouter } from './albums';
import { songsRouter } from './songs';
import { flagsRouter } from './flags';
import { legalRouter } from './legal';

export const userRouter = router({
  // Snapshots
  getSnapshots: snapshotsRouter.getSnapshots,
  getSnapshotData: snapshotsRouter.getSnapshotData,
  getRatingHistory: snapshotsRouter.getRatingHistory,
  deleteSnapshot: snapshotsRouter.deleteSnapshot,

  // Profile
  getUserData: profileRouter.getUserData,
  getProfileSettings: profileRouter.getProfileSettings,
  updateProfileDescription: profileRouter.updateProfileDescription,
  submitProfileReport: profileReportsRouter.submitProfileReport,
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
  getSignInOptions: invitesRouter.getSignInOptions,
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

  // Albums
  getUserAlbums: albumsRouter.getUserAlbums,
  deleteAlbum: albumsRouter.deleteAlbum,

  // Songs
  getAllUniqueSongs: songsRouter.getAllUniqueSongs,
  getSongDetails: songsRouter.getSongDetails,
  getSongScores: songsRouter.getSongScores,
  getSimpleSongDetails: songsRouter.getSimpleSongDetails,

  // Flags
  getUserSelectableFlags: flagsRouter.getUserSelectableFlags,
  setFlagOverrides: flagsRouter.setFlagOverrides,

  // Legal / policy consent
  getPolicies: legalRouter.getPolicies,
  getPendingConsents: legalRouter.getPendingConsents,
  acceptPolicies: legalRouter.acceptPolicies,
});
