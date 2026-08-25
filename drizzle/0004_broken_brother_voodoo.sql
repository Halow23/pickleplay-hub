CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rsvpId` int NOT NULL,
	`status` enum('attended','no_show','late_cancel') NOT NULL,
	`recordedBy` int NOT NULL,
	`checkInAt` timestamp,
	`correctionNote` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_records_rsvp_unique` UNIQUE(`rsvpId`)
);
--> statement-breakpoint
CREATE TABLE `game_threads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`authorId` int NOT NULL,
	`body` varchar(600) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_threads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `group_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`invitedBy` int NOT NULL,
	`email` varchar(320),
	`token` varchar(100) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_invites_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `saved_games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `saved_games_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_games_game_user_unique` UNIQUE(`gameId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `group_memberships` ADD `state` enum('pending','active','denied','removed') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `group_memberships` ADD `reviewedBy` int;--> statement-breakpoint
ALTER TABLE `group_memberships` ADD `reviewedAt` timestamp;--> statement-breakpoint
ALTER TABLE `group_memberships` ADD `decisionReason` varchar(240);--> statement-breakpoint
ALTER TABLE `rsvps` ADD `guestCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rsvps` ADD `idempotencyKey` varchar(100);--> statement-breakpoint
ALTER TABLE `rsvps` ADD CONSTRAINT `rsvps_idempotency_unique` UNIQUE(`idempotencyKey`);--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_rsvpId_rsvps_id_fk` FOREIGN KEY (`rsvpId`) REFERENCES `rsvps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_recordedBy_users_id_fk` FOREIGN KEY (`recordedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_threads` ADD CONSTRAINT `game_threads_gameId_games_id_fk` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_threads` ADD CONSTRAINT `game_threads_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_invites` ADD CONSTRAINT `group_invites_groupId_community_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `community_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_invites` ADD CONSTRAINT `group_invites_invitedBy_users_id_fk` FOREIGN KEY (`invitedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_games` ADD CONSTRAINT `saved_games_gameId_games_id_fk` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_games` ADD CONSTRAINT `saved_games_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_records_recorder_idx` ON `attendance_records` (`recordedBy`);--> statement-breakpoint
CREATE INDEX `game_threads_game_idx` ON `game_threads` (`gameId`);--> statement-breakpoint
CREATE INDEX `group_invites_group_idx` ON `group_invites` (`groupId`);--> statement-breakpoint
CREATE INDEX `saved_games_user_idx` ON `saved_games` (`userId`);--> statement-breakpoint
ALTER TABLE `group_memberships` ADD CONSTRAINT `group_memberships_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;