CREATE INDEX `songs_songname_difficulty_idx` ON `songs` (`songName`,`difficulty`);--> statement-breakpoint
CREATE INDEX `user_scores_snapshotid_idx` ON `user_scores` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `user_snapshots_userid_region_idx` ON `user_snapshots` (`userId`,`region`);