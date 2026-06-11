import { pgTable, text, integer, smallint, bigint, timestamp, unique, index, pgEnum, jsonb, varchar } from "drizzle-orm/pg-core";
import { REGION_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM, CHART_TYPE_ENUM } from "./enums";

// PostgreSQL enum types shared by catalog and user tables
export const regionEnum = pgEnum("region", REGION_ENUM);
export const difficultyEnum = pgEnum("difficulty", DIFFICULTY_ENUM);
export const levelEnum = pgEnum("level", LEVEL_ENUM);
export const chartTypeEnum = pgEnum("chart_type", CHART_TYPE_ENUM);

// parentSong = the chart itself: stable identity across every region and game
// version. Dedup anchor and external (publicId) identity. `disambiguator`
// separates the rare distinct charts sharing (songName, type, difficulty),
// e.g. the two different songs both titled "Link".
export const parentSong = pgTable("parent_song", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(), // Globally stable via the published catalog artifact
  publicId: varchar("publicId", { length: 8 }).notNull().unique(), // Public-facing nanoid (8 chars; see PARENT_PUBLIC_ID_LENGTH)
  songName: text("songName").notNull(),
  artist: text("artist").notNull(),
  genre: text("genre").notNull(),
  cover: text("cover").notNull(), // URL
  bpm: smallint("bpm"),
  type: chartTypeEnum("type").notNull(),
  difficulty: difficultyEnum("difficulty").notNull(),
  disambiguator: smallint("disambiguator").notNull().default(0),
}, (table) => [
  unique("parent_song_name_type_difficulty_disambiguator_unique").on(table.songName, table.type, table.difficulty, table.disambiguator),
  index("parent_song_publicid_idx").on(table.publicId),
  index("parent_song_songname_type_idx").on(table.songName, table.type),
]);

// songs = a chart instance in one region + game version; carries everything
// that varies by version. Chart-stable attributes live on parentSong.
export const songs = pgTable("songs", {
  id: bigint("id", { mode: "bigint" }).primaryKey().generatedByDefaultAsIdentity(), // Globally stable via the published catalog artifact
  parentId: bigint("parentId", { mode: "bigint" }).notNull().references(() => parentSong.id, { onDelete: "cascade" }),
  level: levelEnum("level").notNull(),
  levelPrecise: smallint("levelPrecise").notNull(), // stored as 10x, e.g., 16.5 = 165
  region: regionEnum("region").notNull(),
  gameVersion: smallint("gameVersion").notNull(), // ref @metadata.ts
  addedVersion: smallint("addedVersion").notNull(), // ref @metadata.ts
  noteDesigner: text("noteDesigner"),
  tapCount: smallint("tapCount"),
  holdCount: smallint("holdCount"),
  slideCount: smallint("slideCount"),
  touchCount: smallint("touchCount"),
  breakCount: smallint("breakCount"),
}, (table) => [
  unique("songs_parent_region_version_unique").on(table.parentId, table.region, table.gameVersion),
  index("songs_parentid_idx").on(table.parentId),
  index("songs_region_gameversion_idx").on(table.region, table.gameVersion),
]);

export const tourEvents = pgTable("tour_events", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull().unique(),
  periods: jsonb("periods").notNull().$type<Array<{ start: string | null; end: string | null }>>(),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { precision: 0 }).notNull().defaultNow(),
});

export const tourEventSteps = pgTable("tour_event_steps", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  eventId: integer("eventId").notNull().references(() => tourEvents.id, { onDelete: "cascade" }),
  distance: integer("distance").notNull(),
  type: text("type").notNull(),
  reward: text("reward").notNull(),
}, (table) => [
  index("tour_event_steps_eventid_idx").on(table.eventId),
]);
