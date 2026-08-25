CREATE TABLE `user_blocks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`blockerId` int NOT NULL,
	`blockedUserId` int NOT NULL,
	`reason` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_blocks_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_blocks_pair_unique` UNIQUE(`blockerId`,`blockedUserId`)
);
--> statement-breakpoint
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blockerId_users_id_fk` FOREIGN KEY (`blockerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blockedUserId_users_id_fk` FOREIGN KEY (`blockedUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_blocks_blocker_idx` ON `user_blocks` (`blockerId`);