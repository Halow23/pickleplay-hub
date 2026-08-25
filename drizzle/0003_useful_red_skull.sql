CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int,
	`eventType` varchar(100) NOT NULL,
	`subjectType` varchar(80) NOT NULL,
	`subjectId` int NOT NULL,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `games` ADD `status` enum('draft','published','cancelled','archived') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `rsvpDeadlineAt` timestamp;--> statement-breakpoint
ALTER TABLE `games` ADD `cancellationReason` varchar(300);--> statement-breakpoint
ALTER TABLE `games` ADD `publishedAt` timestamp;--> statement-breakpoint
ALTER TABLE `games` ADD `cancelledAt` timestamp;--> statement-breakpoint
ALTER TABLE `games` ADD `updatedBy` int;--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_events_subject_idx` ON `audit_events` (`subjectType`,`subjectId`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actorId`);--> statement-breakpoint
ALTER TABLE `games` ADD CONSTRAINT `games_updatedBy_users_id_fk` FOREIGN KEY (`updatedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;