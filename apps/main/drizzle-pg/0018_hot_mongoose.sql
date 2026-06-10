CREATE TABLE "catalog_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"sequence" integer NOT NULL,
	"schemaVersion" smallint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"syncedAt" timestamp (0) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "songs_publicId_unique";--> statement-breakpoint
ALTER TABLE "songs" DROP CONSTRAINT "song_name_difficulty_type_region_version_addedversion_unique";--> statement-breakpoint
DROP INDEX "songs_publicid_idx";--> statement-breakpoint
DROP INDEX "songs_songname_difficulty_idx";--> statement-breakpoint
DROP INDEX "songs_songname_type_idx";--> statement-breakpoint
ALTER TABLE "songs" ALTER COLUMN "parentId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "publicId";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "songName";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "artist";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "cover";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "difficulty";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "genre";--> statement-breakpoint
ALTER TABLE "songs" DROP COLUMN "bpm";--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_parent_region_version_unique" UNIQUE("parentId","region","gameVersion");