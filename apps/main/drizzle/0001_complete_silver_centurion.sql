CREATE TABLE `detailed_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshotId` text NOT NULL,
	`songId` text NOT NULL,
	`playIndex` integer NOT NULL,
	`played` integer NOT NULL,
	`fast` integer NOT NULL,
	`late` integer NOT NULL,
	`achievement` integer NOT NULL,
	`dxScore` integer NOT NULL,
	`fc` text NOT NULL,
	`fs` text NOT NULL,
	`tapPerf` integer NOT NULL,
	`tapGreat` integer NOT NULL,
	`tapGood` integer NOT NULL,
	`tapMiss` integer NOT NULL,
	`holdPerf` integer NOT NULL,
	`holdGreat` integer NOT NULL,
	`holdGood` integer NOT NULL,
	`holdMiss` integer NOT NULL,
	`slidePerf` integer NOT NULL,
	`slideGreat` integer NOT NULL,
	`slideGood` integer NOT NULL,
	`slideMiss` integer NOT NULL,
	`touchPerf` integer NOT NULL,
	`touchGreat` integer NOT NULL,
	`touchGood` integer NOT NULL,
	`touchMiss` integer NOT NULL,
	`breakCritPerf` integer NOT NULL,
	`breakPerf` integer NOT NULL,
	`breakGreat` integer NOT NULL,
	`breakGood` integer NOT NULL,
	`breakMiss` integer NOT NULL,
	`venue` text,
	FOREIGN KEY (`snapshotId`) REFERENCES `user_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `fetch_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`region` text NOT NULL,
	`status` text NOT NULL,
	`startedAt` integer NOT NULL,
	`completedAt` integer,
	`errorMessage` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `songs` (
	`id` text PRIMARY KEY NOT NULL,
	`songName` text NOT NULL,
	`artist` text NOT NULL,
	`cover` text NOT NULL,
	`difficulty` text NOT NULL,
	`level` text NOT NULL,
	`levelPrecise` integer NOT NULL,
	`type` text NOT NULL,
	`addedDate` integer NOT NULL,
	`genre` text NOT NULL,
	`intlLevelOverride` text,
	`intlLevelPreciseOverride` integer
);
--> statement-breakpoint
CREATE TABLE `user_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshotId` text NOT NULL,
	`songId` text NOT NULL,
	`playCount` integer NOT NULL,
	`lastPlayed` integer NOT NULL,
	`achievement` integer NOT NULL,
	`dxScore` integer NOT NULL,
	`fc` text NOT NULL,
	`fs` text NOT NULL,
	FOREIGN KEY (`snapshotId`) REFERENCES `user_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`songId`) REFERENCES `songs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`region` text NOT NULL,
	`fetchedAt` integer NOT NULL,
	`gameVersion` integer NOT NULL,
	`rating` integer NOT NULL,
	`courseRank` text NOT NULL,
	`classRank` text NOT NULL,
	`stars` integer NOT NULL,
	`versionPlayCount` integer NOT NULL,
	`totalPlayCount` integer NOT NULL,
	`iconUrl` text NOT NULL,
	`displayName` text NOT NULL,
	`title` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`region` text NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
