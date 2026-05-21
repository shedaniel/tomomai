ALTER TABLE `user` ADD `discordId` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_discordId_unique` ON `user` (`discordId`);