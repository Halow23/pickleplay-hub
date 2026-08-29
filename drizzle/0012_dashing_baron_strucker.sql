CREATE TABLE `direct_messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`body` varchar(2000) NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `direct_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `venues` ADD `lat` decimal(10,7);--> statement-breakpoint
ALTER TABLE `venues` ADD `lng` decimal(10,7);--> statement-breakpoint
ALTER TABLE `direct_messages` ADD CONSTRAINT `direct_messages_senderId_users_id_fk` FOREIGN KEY (`senderId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `direct_messages` ADD CONSTRAINT `direct_messages_recipientId_users_id_fk` FOREIGN KEY (`recipientId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `direct_messages_pair_idx` ON `direct_messages` (`senderId`,`recipientId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `direct_messages_recipient_idx` ON `direct_messages` (`recipientId`,`createdAt`);