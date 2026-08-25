CREATE TABLE `venue_claims` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`claimantId` int NOT NULL,
	`note` varchar(600),
	`state` enum('open','reviewing','accepted','rejected') NOT NULL DEFAULT 'open',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venue_claims_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venue_corrections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`submittedBy` int NOT NULL,
	`field` varchar(80) NOT NULL,
	`proposedValue` varchar(500) NOT NULL,
	`reason` varchar(600),
	`state` enum('open','reviewing','accepted','rejected') NOT NULL DEFAULT 'open',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venue_corrections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venue_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`sourceLabel` varchar(160) NOT NULL,
	`sourceUrl` varchar(500),
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venue_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `venue_staff` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueId` int NOT NULL,
	`userId` int NOT NULL,
	`role` enum('manager','editor') NOT NULL DEFAULT 'editor',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `venue_staff_id` PRIMARY KEY(`id`),
	CONSTRAINT `venue_staff_venue_user_unique` UNIQUE(`venueId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `venue_claims` ADD CONSTRAINT `venue_claims_venueId_venues_id_fk` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_claims` ADD CONSTRAINT `venue_claims_claimantId_users_id_fk` FOREIGN KEY (`claimantId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_claims` ADD CONSTRAINT `venue_claims_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_corrections` ADD CONSTRAINT `venue_corrections_venueId_venues_id_fk` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_corrections` ADD CONSTRAINT `venue_corrections_submittedBy_users_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_corrections` ADD CONSTRAINT `venue_corrections_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_sources` ADD CONSTRAINT `venue_sources_venueId_venues_id_fk` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_staff` ADD CONSTRAINT `venue_staff_venueId_venues_id_fk` FOREIGN KEY (`venueId`) REFERENCES `venues`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `venue_staff` ADD CONSTRAINT `venue_staff_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `venue_claims_venue_idx` ON `venue_claims` (`venueId`);--> statement-breakpoint
CREATE INDEX `venue_claims_state_idx` ON `venue_claims` (`state`);--> statement-breakpoint
CREATE INDEX `venue_corrections_venue_idx` ON `venue_corrections` (`venueId`);--> statement-breakpoint
CREATE INDEX `venue_corrections_state_idx` ON `venue_corrections` (`state`);--> statement-breakpoint
CREATE INDEX `venue_sources_venue_idx` ON `venue_sources` (`venueId`);--> statement-breakpoint
CREATE INDEX `venue_staff_user_idx` ON `venue_staff` (`userId`);