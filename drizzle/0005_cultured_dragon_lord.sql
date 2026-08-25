CREATE TABLE `notification_delivery_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`channel` enum('in_app','email') NOT NULL,
	`state` enum('queued','delivered','failed','suppressed') NOT NULL,
	`providerReference` varchar(160),
	`detail` varchar(500),
	`deliveredAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notification_delivery_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationId` int NOT NULL,
	`state` enum('queued','delivered','failed','suppressed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`lockedAt` timestamp,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_outbox_notification_unique` UNIQUE(`notificationId`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`inAppEnabled` boolean NOT NULL DEFAULT true,
	`emailEnabled` boolean NOT NULL DEFAULT false,
	`gameUpdatesEnabled` boolean NOT NULL DEFAULT true,
	`waitlistUpdatesEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notification_preferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_preferences_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `notification_delivery_records` ADD CONSTRAINT `notification_delivery_records_notificationId_notifications_id_fk` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_outbox` ADD CONSTRAINT `notification_outbox_notificationId_notifications_id_fk` FOREIGN KEY (`notificationId`) REFERENCES `notifications`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `notification_delivery_notification_idx` ON `notification_delivery_records` (`notificationId`);--> statement-breakpoint
CREATE INDEX `notification_delivery_state_idx` ON `notification_delivery_records` (`state`);--> statement-breakpoint
CREATE INDEX `notification_outbox_state_idx` ON `notification_outbox` (`state`,`nextAttemptAt`);