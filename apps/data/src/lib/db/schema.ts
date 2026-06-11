import { pgTable, integer, smallint, text, timestamp, varchar, unique } from "drizzle-orm/pg-core";
import { parentSong, songs, tourEvents, tourEventSteps, regionEnum, difficultyEnum, levelEnum, chartTypeEnum } from "@tomomai/catalog/schema";

// The data service owns the canonical catalog: same tables as the shared
// contract, plus release bookkeeping for published artifacts.
export { parentSong, songs, tourEvents, tourEventSteps, regionEnum, difficultyEnum, levelEnum, chartTypeEnum };

export const catalogReleases = pgTable("catalog_releases", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sequence: integer("sequence").notNull(),
  schemaVersion: smallint("schemaVersion").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  url: text("url").notNull(),
  parentCount: integer("parentCount").notNull(),
  songCount: integer("songCount").notNull(),
  tourEventCount: integer("tourEventCount").notNull(),
  createdAt: timestamp("createdAt", { precision: 0 }).notNull().defaultNow(),
}, (table) => [
  unique("catalog_releases_sequence_unique").on(table.sequence),
]);
