ALTER TABLE `reports` ADD `assignedTo` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolutionReason` varchar(300);--> statement-breakpoint
ALTER TABLE `reports` ADD `resolutionNote` varchar(600);--> statement-breakpoint
ALTER TABLE `reports` ADD `sanction` enum('none','warning','suspension','ban') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolvedAt` timestamp;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_assignedTo_users_id_fk` FOREIGN KEY (`assignedTo`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;