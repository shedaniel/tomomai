DROP INDEX `song_name_region_version_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `song_name_difficulty_type_region_version_unique` ON `songs` (`songName`,`difficulty`,`type`,`region`,`gameVersion`);--> statement-breakpoint
ALTER TABLE `songs` DROP COLUMN `addedDate`;--> statement-breakpoint
ALTER TABLE `user_scores` DROP COLUMN `playCount`;--> statement-breakpoint
ALTER TABLE `user_scores` DROP COLUMN `lastPlayed`;