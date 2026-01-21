// Main exports for Discord functionality
export { COMMANDS, handleCommand, handleComponents } from './commands';
export type { CommandContext, ComponentContext } from './commands';

// Response utilities
export {
  createDeferredResponse, createErrorResponse, createNoDataResponse, createNotRegisteredResponse, createPongResponse, createUnknownCommandResponse, DISCORD_COLORS, editDiscordMessage,
  editDiscordMessageWithImage,
  getRatingComment,
  getStateFriendlyName
} from './responses';
export type { DiscordEmbed, DiscordResponse } from './responses';

// Individual command handlers
export { handleFetchCommand } from './commands/fetch';
export type { FetchCommandOptions } from './commands/fetch';
export { handleInviteCommand } from './commands/invite';
export type { InviteCommandOptions } from './commands/invite';
export { handleProfileCommand } from './commands/profile';
export type { ProfileCommandOptions } from './commands/profile';
export { handleRecentsCommand } from './commands/recents';
export type { RecentsCommandOptions } from './commands/recents';
export { handleAlbumPreferenceSelection } from './commands/album-preference';
export type { AlbumPreferenceOptions } from './commands/album-preference';

// Image generation utilities
export { generateAndSendProfileImage } from './image-utils';
export type { ImageGenerationOptions, SnapshotData } from './image-utils';
