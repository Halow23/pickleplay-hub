CREATE TABLE `community_groups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(80) NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`neighborhood` varchar(120) NOT NULL,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `community_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_groups_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `game_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`groupId` int,
	`authorId` int NOT NULL,
	`headline` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`attendanceExpectations` varchar(240) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `game_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `game_posts_game_unique` UNIQUE(`gameId`)
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(100) NOT NULL,
	`organizerId` int NOT NULL,
	`venueId` int NOT NULL,
	`groupId` int,
	`title` varchar(180) NOT NULL,
	`description` text NOT NULL,
	`format` varchar(80) NOT NULL,
	`skillBand` varchar(80) NOT NULL,
	`capacity` int NOT NULL,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`beginnerFriendly` boolean NOT NULL DEFAULT false,
	`attendanceNote` varchar(240) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `games_id` PRIMARY KEY(`id`),
	CONSTRAINT `games_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `group_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('member','moderator','owner') NOT NULL DEFAULT 'member',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_memberships_group_user_unique` UNIQUE(`groupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`gameId` int,
	`type` enum('game_confirmed','waitlist_promoted','organizer_update') NOT NULL,
	`title` varchar(180) NOT NULL,
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `player_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`city` varchar(120) NOT NULL DEFAULT 'Your local area',
	`bio` text,
	`skillBand` varchar(80) NOT NULL DEFAULT 'Finding my starting point',
	`ratingProvenance` enum('none','self_described','linked_provider') NOT NULL DEFAULT 'none',
	`visibility` enum('community','private') NOT NULL DEFAULT 'community',
	`preferredFormats` varchar(180) NOT NULL DEFAULT 'Open play, doubles',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `player_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `player_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reporterId` int NOT NULL,
	`subjectType` enum('profile','group','game','game_post') NOT NULL,
	`subjectId` int NOT NULL,
	`reason` varchar(120) NOT NULL,
	`detail` text,
	`status` enum('open','reviewing','closed') NOT NULL DEFAULT 'open',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gameId` int NOT NULL,
	`userId` int NOT NULL,
	`state` enum('confirmed','waitlisted') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rsvps_id` PRIMARY KEY(`id`),
	CONSTRAINT `rsvps_game_user_unique` UNIQUE(`gameId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `venues` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL,
	`neighborhood` varchar(120) NOT NULL,
	`city` varchar(120) NOT NULL,
	`addressLabel` varchar(200) NOT NULL,
	`courtCount` int NOT NULL DEFAULT 1,
	`indoor` boolean NOT NULL DEFAULT false,
	`lighting` boolean NOT NULL DEFAULT false,
	`visibility` enum('public','private') NOT NULL DEFAULT 'public',
	`accessibilityNote` varchar(220),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venues_id` PRIMARY KEY(`id`),
	CONSTRAINT `venues_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','player','organizer','moderator','admin') NOT NULL DEFAULT 'player';--> statement-breakpoint
ALTER TABLE `community_groups` ADD CONSTRAINT `community_groups_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_posts` ADD CONSTRAINT `game_posts_gameId_games_id_fk` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_posts` ADD CONSTRAINT `game_posts_groupId_community_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `community_groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `game_posts` ADD CONSTRAINT `game_posts_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `games` ADD CONSTRAINT `games_organizerId_users_id_fk` FOREIGN KEY (`organizerId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `games` ADD CONSTRAINT `games_venueId_venues_id_fk` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `games` ADD CONSTRAINT `games_groupId_community_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `community_groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_memberships` ADD CONSTRAINT `group_memberships_groupId_community_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `community_groups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `group_memberships` ADD CONSTRAINT `group_memberships_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_gameId_games_id_fk` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD CONSTRAINT `player_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_reporterId_users_id_fk` FOREIGN KEY (`reporterId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rsvps` ADD CONSTRAINT `rsvps_gameId_games_id_fk` FOREIGN KEY (`gameId`) REFERENCES `games`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rsvps` ADD CONSTRAINT `rsvps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_groups_owner_idx` ON `community_groups` (`ownerId`);--> statement-breakpoint
CREATE INDEX `game_posts_group_idx` ON `game_posts` (`groupId`);--> statement-breakpoint
CREATE INDEX `games_venue_idx` ON `games` (`venueId`);--> statement-breakpoint
CREATE INDEX `games_organizer_idx` ON `games` (`organizerId`);--> statement-breakpoint
CREATE INDEX `games_start_idx` ON `games` (`startsAt`);--> statement-breakpoint
CREATE INDEX `group_memberships_user_idx` ON `group_memberships` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reports_status_idx` ON `reports` (`status`);--> statement-breakpoint
CREATE INDEX `reports_reporter_idx` ON `reports` (`reporterId`);--> statement-breakpoint
CREATE INDEX `rsvps_game_state_idx` ON `rsvps` (`gameId`,`state`);--> statement-breakpoint
CREATE INDEX `rsvps_user_idx` ON `rsvps` (`userId`);--> statement-breakpoint
CREATE INDEX `venues_city_idx` ON `venues` (`city`);