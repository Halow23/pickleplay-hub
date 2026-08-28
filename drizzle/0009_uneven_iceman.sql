ALTER TABLE `users` MODIFY COLUMN `updatedAt` timestamp NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `reports` ADD `subjectUserId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','suspended','banned') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_subjectUserId_users_id_fk` FOREIGN KEY (`subjectUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reports_subject_user_idx` ON `reports` (`subjectUserId`);