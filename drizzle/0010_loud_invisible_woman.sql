ALTER TABLE `player_profiles` MODIFY COLUMN `updatedAt` timestamp NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `player_profiles` ADD `calendarFeedToken` varchar(64);--> statement-breakpoint
ALTER TABLE `player_profiles` ADD CONSTRAINT `player_profiles_feed_token_unique` UNIQUE(`calendarFeedToken`);