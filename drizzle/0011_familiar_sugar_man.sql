ALTER TABLE `games` ADD `recurrence` enum('none','weekly','biweekly') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `parentGameId` int;