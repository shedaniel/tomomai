import { pgTable, text, integer, smallint, bigint, bigserial, boolean, timestamp, unique, uniqueIndex, index, pgEnum, jsonb, varchar, check, uuid, point, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  LANGUAGE_ENUM,
  REGION_ENUM,
  DIFFICULTY_ENUM,
  LEVEL_ENUM,
  CHART_TYPE_ENUM,
  FC_ENUM,
  FS_ENUM,
  FETCH_STATUS_ENUM,
  EVENT_TYPE_ENUM,
  EVENT_STATE_ENUM,
  STORE_STATUS_ENUM,
  TITLE_TYPE_ENUM,
} from "./types";

// PostgreSQL enum types
export const languageEnum = pgEnum("language", LANGUAGE_ENUM);
export const regionEnum = pgEnum("region", REGION_ENUM);
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const difficultyEnum = pgEnum("difficulty", DIFFICULTY_ENUM);
export const levelEnum = pgEnum("level", LEVEL_ENUM);
export const chartTypeEnum = pgEnum("chart_type", CHART_TYPE_ENUM);
export const fcEnum = pgEnum("fc", FC_ENUM);
export const fsEnum = pgEnum("fs", FS_ENUM);
export const fetchStatusEnum = pgEnum("fetch_status", FETCH_STATUS_ENUM);
export const eventTypeEnum = pgEnum("event_type", EVENT_TYPE_ENUM);
export const eventStateEnum = pgEnum("event_state", EVENT_STATE_ENUM);
export const storeStatusEnum = pgEnum("store_status", STORE_STATUS_ENUM);
export const titleTypeEnum = pgEnum("title_type", TITLE_TYPE_ENUM);
export const legalDocTypeEnum = pgEnum("legal_doc_type", ["tos", "privacy"]);
export const profileReportReasonEnum = pgEnum("profile_report_reason", [
  "harassment",
  "hate",
  "sexual",
  "violence",
  "spam",
  "impersonation",
  "other",
]);
export const profileReportStatusEnum = pgEnum("profile_report_status", ["pending", "dismissed", "removed"]);

// Existing auth tables
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull(),
  username: varchar("username", { length: 32 }).unique(), // 1-32 characters, letters, numbers, dashes, underscores only
  language: languageEnum("language"), // nullable, null = auto-detect
  role: roleEnum("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires", { precision: 0 }),
  region: regionEnum("region"), // nullable, null = intl (default)
  // Profile publishing settings
  publishProfile: boolean("publishProfile").notNull().default(false),
  profileMainRegion: regionEnum("profileMainRegion").notNull().default("intl"),
  profileShowAllScores: boolean("profileShowAllScores").notNull().default(true),
  profileShowScoreDetails: boolean("profileShowScoreDetails").notNull().default(true),
  profileShowPlates: boolean("profileShowPlates").notNull().default(true),
  profileShowPlayCounts: boolean("profileShowPlayCounts").notNull().default(true),
  profileShowEvents: boolean("profileShowEvents").notNull().default(true),
  profileShowInSearch: boolean("profileShowInSearch").notNull().default(true),
  profileDescription: text("profileDescription"),
  // Fetch settings
  fetchUseAlbums: boolean("fetchUseAlbums"),
  // Feature flag overrides for userSelectable flags. Null = no overrides.
  flagOverrides: jsonb("flagOverrides").$type<Record<string, boolean>>(),
}, (table) => [
  check("username_pattern", sql`${table.username} IS NULL OR (length(${table.username}) >= 1 AND ${table.username} ~ '^[a-zA-Z0-9_-]+$')`),
]);

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  impersonatedBy: text("impersonatedBy"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }),
  updatedAt: timestamp("updatedAt", { precision: 0 }),
});

export const passkey = pgTable("passkey", {
  id: text("id").primaryKey(),
  name: text("name"),
  publicKey: text("publicKey").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  credentialID: text("credentialID").notNull(),
  counter: integer("counter").notNull(),
  deviceType: text("deviceType").notNull(),
  backedUp: boolean("backedUp").notNull(),
  transports: text("transports"),
  createdAt: timestamp("createdAt", { precision: 0 }),
  aaguid: text("aaguid"),
}, (table) => [
  index("passkey_userid_idx").on(table.userId),
  index("passkey_credentialid_idx").on(table.credentialID),
]);

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  createdBy: text("createdBy").notNull().references(() => user.id, { onDelete: "cascade" }),
  claimedBy: text("claimedBy").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull(),
  claimedAt: timestamp("claimedAt", { precision: 0 }),
  expiresAt: timestamp("expiresAt", { precision: 0 }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
}, (table) => [
  index("invites_createdby_idx").on(table.createdBy),
]);

export const profileReports = pgTable("profile_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporterUserId: text("reporterUserId").notNull().references(() => user.id, { onDelete: "cascade" }),
  targetUserId: text("targetUserId").notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: profileReportReasonEnum("reason").notNull(),
  details: varchar("details", { length: 1000 }),
  descriptionSnapshot: text("descriptionSnapshot").notNull(),
  status: profileReportStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
  resolvedAt: timestamp("resolvedAt", { precision: 0 }),
  // Moderator who resolved the report. Kept nullable and set-null on delete so
  // the audit row survives the moderator's account being removed.
  resolvedByUserId: text("resolvedByUserId").references(() => user.id, { onDelete: "set null" }),
  resolutionNote: varchar("resolutionNote", { length: 1000 }),
}, (table) => [
  index("profile_reports_status_createdat_idx").on(table.status, table.createdAt),
  index("profile_reports_targetuserid_idx").on(table.targetUserId),
  uniqueIndex("profile_reports_pending_reporter_target_idx")
    .on(table.reporterUserId, table.targetUserId)
    .where(sql`${table.status} = 'pending'`),
]);

// Maimai-specific tables
export const userTokens = pgTable("user_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  region: regionEnum("region").notNull(),
  token: text("token").notNull(), // Encrypted
  createdAt: timestamp("createdAt", { precision: 0 }).notNull(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull(),
}, (table) => [
  unique().on(table.userId, table.region),
]);

export const fetchSessions = pgTable("fetch_sessions", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal auto-increment ID
  publicId: varchar("publicId", { length: 21 }).notNull().unique(), // Public-facing nanoid
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  region: regionEnum("region").notNull(),
  status: fetchStatusEnum("status").notNull(),
  startedAt: timestamp("startedAt", { precision: 0 }).notNull(),
  completedAt: timestamp("completedAt", { precision: 0 }),
  errorMessage: text("errorMessage"),
  statusStates: text("statusStates"), // Comma-separated list of completed states
  extraData: jsonb("extraData"),
}, (table) => [
  index("fetch_sessions_publicid_idx").on(table.publicId),
  index("fetch_sessions_userid_region_startedat_idx").on(table.userId, table.region, table.startedAt),
]);

export const userSnapshots = pgTable("user_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(), // Internal auto-increment ID for efficient indexing
  publicId: varchar("publicId", { length: 21 }).notNull().unique(), // Public-facing nanoid
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  region: regionEnum("region").notNull(),
  fetchedAt: timestamp("fetchedAt", { precision: 0 }).notNull(),
  gameVersion: smallint("gameVersion").notNull(),
  rating: smallint("rating").notNull(), // 0-20000
  courseRankUrl: text("courseRankUrl").notNull(),
  classRankUrl: text("classRankUrl").notNull(),
  stars: smallint("stars").notNull(),
  versionPlayCount: integer("versionPlayCount").notNull(),
  totalPlayCount: integer("totalPlayCount").notNull(),
  iconUrl: text("iconUrl").notNull(),
  displayName: varchar("displayName", { length: 16 }).notNull(),
  title: text("title").notNull(),
  titleType: titleTypeEnum("titleType").notNull().default("normal"),
}, (table) => [
  index("user_snapshots_publicid_idx").on(table.publicId),
  index("user_snapshots_userid_region_idx").on(table.userId, table.region),
  index("user_snapshots_userid_region_fetchedat_idx").on(table.userId, table.region, table.fetchedAt),
]);

export const songs = pgTable("songs", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal auto-increment ID
  publicId: varchar("publicId", { length: 21 }).notNull().unique(), // Public-facing nanoid
  songName: text("songName").notNull(),
  artist: text("artist").notNull(),
  cover: text("cover").notNull(), // URL
  difficulty: difficultyEnum("difficulty").notNull(),
  level: levelEnum("level").notNull(),
  levelPrecise: smallint("levelPrecise").notNull(), // stored as 10x, e.g., 16.5 = 165
  type: chartTypeEnum("type").notNull(),
  genre: text("genre").notNull(), // Will define enum later based on maimai genres
  region: regionEnum("region").notNull(),
  gameVersion: smallint("gameVersion").notNull(), // ref @metadata.ts
  addedVersion: smallint("addedVersion").notNull(), // ref @metadata.ts
  bpm: smallint("bpm"),
  noteDesigner: text("noteDesigner"),
  tapCount: smallint("tapCount"),
  holdCount: smallint("holdCount"),
  slideCount: smallint("slideCount"),
  touchCount: smallint("touchCount"),
  breakCount: smallint("breakCount"),
}, (table) => [
  unique("song_name_difficulty_type_region_version_addedversion_unique").on(table.songName, table.difficulty, table.type, table.region, table.gameVersion, table.addedVersion),
  index("songs_publicid_idx").on(table.publicId),
  index("songs_region_gameversion_idx").on(table.region, table.gameVersion),
  index("songs_songname_difficulty_idx").on(table.songName, table.difficulty),
  index("songs_songname_type_idx").on(table.songName, table.type),
]);

export const scoreData = pgTable("score_data", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  songId: bigint("songId", { mode: "bigint" }).notNull().references(() => songs.id, { onDelete: "cascade" }),
  achievement: integer("achievement").notNull(),
  dxScore: smallint("dxScore").notNull(),
  fc: fcEnum("fc").notNull(),
  fs: fsEnum("fs").notNull(),
}, (table) => [
  unique("score_data_songid_achievement_dxscore_fc_fs_unique").on(table.songId, table.achievement, table.dxScore, table.fc, table.fs),
  index("score_data_songid_idx").on(table.songId),
]);

export const snapshotScores = pgTable("snapshot_scores", {
  snapshotId: integer("snapshotId").notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  scoreId: integer("scoreId").notNull().references(() => scoreData.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.snapshotId, table.scoreId] }),
]);

export const snapshotB50 = pgTable("snapshot_b50", {
  snapshotId: integer("snapshotId").notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  rank: smallint("rank").notNull(),
  scoreId: integer("scoreId").notNull().references(() => scoreData.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.snapshotId, table.rank] }),
]);

export const userEvents = pgTable("user_events", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal only, never exposed
  snapshotId: integer("snapshotId").notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  eventType: eventTypeEnum("eventType").notNull(), // area or eventArea
  name: text("name").notNull(),
  currentDistance: integer("currentDistance").notNull(), // 4 bytes
  nextRewardDistance: integer("nextRewardDistance"), // nullable, 4 bytes
  state: eventStateEnum("state").notNull(),
  imageUrl: text("imageUrl").notNull(),
  eventPeriodStart: timestamp("eventPeriodStart", { precision: 0 }), // nullable for area events
  eventPeriodEnd: timestamp("eventPeriodEnd", { precision: 0 }), // nullable for area events
}, (table) => [
  index("user_events_snapshotid_idx").on(table.snapshotId),
]);

export const userRecentSongs = pgTable("user_recent_songs", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal only, never exposed
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  songId: bigint("songId", { mode: "bigint" }).notNull().references(() => songs.id, { onDelete: "cascade" }),
  playedAt: timestamp("playedAt", { precision: 0 }).notNull(),
  archievement: integer("archievement").notNull(), // stored as 10000x, e.g., 99.1234% = 991234 (max 1010000)
  dxScore: smallint("dxScore").notNull(),
  maxDxScore: smallint("maxDxScore").notNull(),
  fc: fcEnum("fc").notNull(),
  fs: fsEnum("fs").notNull(),
  track: smallint("track").notNull(),
}, (table) => [
  // Unique constraint to prevent duplicate entries at DB level
  unique("user_recent_songs_userid_songid_playedat_unique").on(table.userId, table.songId, table.playedAt),
  // Primary query pattern: get recent plays for a user (ordered by playedAt DESC)
  index("user_recent_songs_userid_playedat_idx").on(table.userId, table.playedAt.desc()),
  // For duplicate checking and getting play history of a specific song for a user
  index("user_recent_songs_userid_songid_idx").on(table.userId, table.songId),
  // For queries related to specific songs across all users (analytics/admin)
  index("user_recent_songs_songid_idx").on(table.songId),
]);

export const userRecentSongsDetailed = pgTable("user_recent_songs_detailed", {
  recentSongId: bigint("recentSongId", { mode: "bigint" }).primaryKey().references(() => userRecentSongs.id, { onDelete: "cascade" }),
  fastCount: smallint("fastCount").notNull(),
  lateCount: smallint("lateCount").notNull(),
  combo: smallint("combo").notNull(),
  maxCombo: smallint("maxCombo").notNull(),
  syncScore: smallint("syncScore"),
  maxSyncScore: smallint("maxSyncScore"),
  tapCPerfect: smallint("tapCPerfect").notNull(),
  tapPerfect: smallint("tapPerfect").notNull(),
  tapGreat: smallint("tapGreat").notNull(),
  tapGood: smallint("tapGood").notNull(),
  tapMiss: smallint("tapMiss").notNull(),
  holdCPerfect: smallint("holdCPerfect").notNull(),
  holdPerfect: smallint("holdPerfect").notNull(),
  holdGreat: smallint("holdGreat").notNull(),
  holdGood: smallint("holdGood").notNull(),
  holdMiss: smallint("holdMiss").notNull(),
  slideCPerfect: smallint("slideCPerfect").notNull(),
  slidePerfect: smallint("slidePerfect").notNull(),
  slideGreat: smallint("slideGreat").notNull(),
  slideGood: smallint("slideGood").notNull(),
  slideMiss: smallint("slideMiss").notNull(),
  touchCPerfect: smallint("touchCPerfect").notNull(),
  touchPerfect: smallint("touchPerfect").notNull(),
  touchGreat: smallint("touchGreat").notNull(),
  touchGood: smallint("touchGood").notNull(),
  touchMiss: smallint("touchMiss").notNull(),
  breakCPerfect: smallint("breakCPerfect").notNull(),
  breakPerfect: smallint("breakPerfect").notNull(),
  breakGreat: smallint("breakGreat").notNull(),
  breakGood: smallint("breakGood").notNull(),
  breakMiss: smallint("breakMiss").notNull(),
  venue: text("venue"),
  rating: smallint("rating").notNull(),
  ratingChange: smallint("ratingChange").notNull(),
}, (table) => [
]);

export const stores = pgTable("stores", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  country: text("country").notNull(),
  area: text("area"), // Nullable, used for JP prefectures
  name: text("name").notNull(),
  address: text("address").notNull(),
  location: point("location", { mode: "xy" }),
  chosenEditId: bigint("chosenEditId", { mode: "bigint" }), // References store_edits.id
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull().defaultNow(),
}, (table) => [
  index("stores_country_area_idx").on(table.country, table.area),
  unique("stores_name_address_unique").on(table.name, table.address),
]);

export const storeEdits = pgTable("store_edits", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  storeId: bigint("storeId", { mode: "bigint" }).notNull().references(() => stores.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 32 }),
  address: text("address"), // 10-256 chars validation in app
  openingHours: text("openingHours"),
  toilet: boolean("toilet"),
  smoke: boolean("smoke"),
  access: text("access"),
  status: storeStatusEnum("status"),
  currency: text("currency"),
  games: jsonb("games"), // { [game: string]: { amount: number, price: number } }
  additionalInfo: jsonb("additionalInfo"),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull().defaultNow(),
}, (table) => [
  index("store_edits_storeid_idx").on(table.storeId),
  index("store_edits_userid_idx").on(table.userId),
  index("store_edits_storeid_userid_idx").on(table.storeId, table.userId),
]);

export const storeEditVotes = pgTable("store_edit_votes", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  editId: bigint("editId", { mode: "bigint" }).notNull().references(() => storeEdits.id, { onDelete: "cascade" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  vote: smallint("vote").notNull(), // 1 or -1
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
}, (table) => [
  unique("store_edit_votes_userid_editid_unique").on(table.userId, table.editId),
  index("store_edit_votes_editid_idx").on(table.editId),
]);

// Better Auth apiKey plugin table
export const apikey = pgTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  referenceId: text("referenceId").notNull(),
  configId: text("configId").notNull(),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: timestamp("lastRefillAt"),
  enabled: boolean("enabled").notNull().default(true),
  rateLimitEnabled: boolean("rateLimitEnabled"),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount"),
  remaining: integer("remaining"),
  lastRequest: timestamp("lastRequest"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
}, (table) => [
  index("apikey_key_idx").on(table.key),
  index("apikey_referenceid_idx").on(table.referenceId),
  index("apikey_configid_idx").on(table.configId),
]);

export const tourEvents = pgTable("tour_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull().unique(),
  periods: jsonb("periods").notNull().$type<Array<{ start: string | null; end: string | null }>>(),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull().defaultNow(),
});

export const tourEventSteps = pgTable("tour_event_steps", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventId: integer("eventId").notNull().references(() => tourEvents.id, { onDelete: "cascade" }),
  distance: integer("distance").notNull(),
  type: text("type").notNull(),
  reward: text("reward").notNull(),
}, (table) => [
  index("tour_event_steps_eventid_idx").on(table.eventId),
]);

export const userAlbums = pgTable("user_albums", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  songId: bigint("songId", { mode: "bigint" }).notNull().references(() => songs.id, { onDelete: "cascade" }),
  takenAt: timestamp("takenAt", { precision: 0 }).notNull(),
  venue: text("venue"),
  imageKey: text("imageKey").notNull(),
  imageSize: integer("imageSize").notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
}, (table) => [
  index("user_albums_userid_takenat_idx").on(table.userId, table.takenAt.desc()),
  index("user_albums_songid_idx").on(table.songId),
]);

// Better Auth JWT plugin table
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  expiresAt: timestamp("expiresAt"),
});

// Better Auth OAuth Provider plugin tables
export const oauthClient = pgTable("oauthClient", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  disabled: boolean("disabled").default(false),
  skipConsent: boolean("skipConsent"),
  enableEndSession: boolean("enableEndSession"),
  subjectType: text("subjectType"),
  scopes: text("scopes").array(),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("softwareId"),
  softwareVersion: text("softwareVersion"),
  softwareStatement: text("softwareStatement"),
  redirectUris: text("redirectUris").array().notNull(),
  postLogoutRedirectUris: text("postLogoutRedirectUris").array(),
  tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
  grantTypes: text("grantTypes").array(),
  responseTypes: text("responseTypes").array(),
  public: boolean("public"),
  type: text("type"),
  requirePKCE: boolean("requirePKCE"),
  referenceId: text("referenceId"),
  metadata: jsonb("metadata"),
}, (table) => [
  index("oauth_client_userid_idx").on(table.userId),
]);

export const oauthRefreshToken = pgTable("oauthRefreshToken", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  revoked: timestamp("revoked"),
  authTime: timestamp("authTime"),
  scopes: text("scopes").array().notNull(),
}, (table) => [
  index("oauth_refresh_token_clientid_idx").on(table.clientId),
  index("oauth_refresh_token_sessionid_idx").on(table.sessionId),
  index("oauth_refresh_token_userid_idx").on(table.userId),
]);

export const oauthAccessToken = pgTable("oauthAccessToken", {
  id: text("id").primaryKey(),
  token: text("token").unique(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  sessionId: text("sessionId").references(() => session.id, { onDelete: "set null" }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  refreshId: text("refreshId").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  scopes: text("scopes").array().notNull(),
}, (table) => [
  index("oauth_access_token_clientid_idx").on(table.clientId),
  index("oauth_access_token_sessionid_idx").on(table.sessionId),
  index("oauth_access_token_userid_idx").on(table.userId),
  index("oauth_access_token_refreshid_idx").on(table.refreshId),
]);

export const oauthConsent = pgTable("oauthConsent", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull().references(() => oauthClient.clientId, { onDelete: "cascade" }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  referenceId: text("referenceId"),
  scopes: text("scopes").array().notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}, (table) => [
  index("oauth_consent_clientid_idx").on(table.clientId),
  index("oauth_consent_userid_idx").on(table.userId),
]);

// The latest accepted version per doc type is MAX(version) grouped by docType
// (see getAcceptedPolicyVersions in lib/legal-acceptance.ts).
export const policyAcceptance = pgTable("policyAcceptance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(), // internal only
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  docType: legalDocTypeEnum("docType").notNull(),
  version: text("version").notNull(), // "YYYYMMDD" accepted
  acceptedAt: timestamp("acceptedAt", { precision: 0 }).notNull(),
}, (table) => [
  index("policy_acceptance_userid_idx").on(table.userId),
  index("policy_acceptance_user_doc_idx").on(table.userId, table.docType),
]);
