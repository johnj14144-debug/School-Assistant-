CREATE TABLE `block` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text,
	`title` text DEFAULT '' NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "block_source" CHECK("block"."source" in ('manual', 'planner')),
	CONSTRAINT "block_order" CHECK(julianday("block"."end_at") > julianday("block"."start_at"))
);
--> statement-breakpoint
CREATE INDEX `block_task_idx` ON `block` (`task_id`);--> statement-breakpoint
CREATE INDEX `block_start_idx` ON `block` (`start_at`);--> statement-breakpoint
CREATE TABLE `fixed_event` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`course_id` text,
	`location` text DEFAULT '' NOT NULL,
	`start_date` text NOT NULL,
	`start_local` text NOT NULL,
	`end_local` text NOT NULL,
	`rrule` text,
	`time_zone` text NOT NULL,
	`exceptions` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "fixed_event_kind" CHECK("fixed_event"."kind" in ('class', 'sleep', 'meal', 'hygiene', 'other'))
);
--> statement-breakpoint
CREATE INDEX `fixed_event_course_idx` ON `fixed_event` (`course_id`);