DROP INDEX `user_scores_snapshotid_idx`;--> statement-breakpoint
ALTER TABLE `user_scores` ADD `rank` integer;--> statement-breakpoint
CREATE INDEX `user_scores_snapshotid_rank_idx` ON `user_scores` (`snapshotId`,`rank`);