ALTER TABLE `user` ADD `publishProfile` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileMainRegion` text DEFAULT 'intl' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowAllScores` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowScoreDetails` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowPlates` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowPlayCounts` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowEvents` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `profileShowInSearch` integer DEFAULT true NOT NULL;