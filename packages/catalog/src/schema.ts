import { pgTable, text, integer, smallint, bigint, timestamp, unique, index, pgEnum, jsonb, varchar } from "drizzle-orm/pg-core";
import { REGION_ENUM, DIFFICULTY_ENUM, LEVEL_ENUM, CHART_TYPE_ENUM } from "./enums";

// PostgreSQL enum types shared by catalog and user tables
export const regionEnum = pgEnum("region", REGION_ENUM);
export const difficultyEnum = pgEnum("difficulty", DIFFICULTY_ENUM);
export const levelEnum = pgEnum("level", LEVEL_ENUM);
export const chartTypeEnum = pgEnum("chart_type", CHART_TYPE_ENUM);

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
