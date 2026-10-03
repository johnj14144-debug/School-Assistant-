ALTER TABLE `block` ADD `kind` text DEFAULT 'work' NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `earliest_start_at` text;--> statement-breakpoint
ALTER TABLE `task` ADD `splittable` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `min_chunk_min` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `allow_late` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `task` ADD `steps` text DEFAULT '[]' NOT NULL;