CREATE TABLE `user_events` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshotId` text NOT NULL,
	`eventType` text NOT NULL,
	`name` text NOT NULL,
	`currentDistance` integer NOT NULL,
	`nextRewardDistance` integer,
	`state` text NOT NULL,
	`imageUrl` text NOT NULL,
	`eventPeriodStart` integer,
	`eventPeriodEnd` integer,
	FOREIGN KEY (`snapshotId`) REFERENCES `user_snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_events_snapshotid_idx` ON `user_events` (`snapshotId`);