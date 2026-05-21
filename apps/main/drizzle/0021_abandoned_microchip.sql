ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `banned` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `banReason` text;--> statement-breakpoint
ALTER TABLE `user` ADD `banExpires` integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `detailed_scores_songid_idx` ON `detailed_scores` (`songId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `user_scores_songid_idx` ON `user_scores` (`songId`);