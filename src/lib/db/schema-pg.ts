import { pgTable, text, integer, smallint, bigint, bigserial, boolean, timestamp, unique, index, pgEnum, jsonb, varchar, check, uuid, point, primaryKey } from "drizzle-orm/pg-core";
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
  // Fetch settings
  fetchUseAlbums: boolean("fetchUseAlbums"),
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
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal auto-increment ID for efficient indexing
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
  gameVersion: smallint("gameVersion").notNull(),
  addedVersion: smallint("addedVersion").notNull(), // -1 for legacy versions, or actual version number for newer versions
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

export const userScores = pgTable("user_scores", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal only, never exposed
  snapshotId: bigint("snapshotId", { mode: "bigint" }).notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  songId: bigint("songId", { mode: "bigint" }).notNull().references(() => songs.id, { onDelete: "cascade" }),
  achievement: integer("achievement").notNull(), // stored as 10000x, e.g., 99.1234% = 991234 (max 1010000)
  dxScore: smallint("dxScore").notNull(),
  fc: fcEnum("fc").notNull(),
  fs: fsEnum("fs").notNull(),
  rank: smallint("rank"), // Rank of the song in the snapshot (0-based). null = uncalculated, 0-49 = B50, 50+ = not in B50
}, (table) => [
  index("user_scores_snapshotid_rank_idx").on(table.snapshotId, table.rank),
  index("user_scores_snapshotid_songid_idx").on(table.snapshotId, table.songId),
  index("user_scores_songid_idx").on(table.songId),
]);

export const scoreData = pgTable("score_data", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(),
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
  snapshotId: bigint("snapshotId", { mode: "bigint" }).notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  scoreId: bigint("scoreId", { mode: "bigint" }).notNull().references(() => scoreData.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.snapshotId, table.scoreId] }),
]);

export const snapshotB50 = pgTable("snapshot_b50", {
  snapshotId: bigint("snapshotId", { mode: "bigint" }).notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
  rank: smallint("rank").notNull(),
  scoreId: bigint("scoreId", { mode: "bigint" }).notNull().references(() => scoreData.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.snapshotId, table.rank] }),
]);

export const userEvents = pgTable("user_events", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity(), // Internal only, never exposed
  snapshotId: bigint("snapshotId", { mode: "bigint" }).notNull().references(() => userSnapshots.id, { onDelete: "cascade" }),
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
