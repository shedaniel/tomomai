ALTER TABLE `songs` ADD `region` text NOT NULL;--> statement-breakpoint
ALTER TABLE `songs` ADD `gameVersion` integer NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `song_name_region_version_unique` ON `songs` (`songName`,`region`,`gameVersion`);--> statement-breakpoint
ALTER TABLE `songs` DROP COLUMN `intlLevelOverride`;--> statement-breakpoint
ALTER TABLE `songs` DROP COLUMN `intlLevelPreciseOverride`;