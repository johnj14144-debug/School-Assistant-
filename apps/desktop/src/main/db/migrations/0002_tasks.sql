CREATE TABLE `task` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`course_id` text,
	`assignment_id` text,
	`type` text DEFAULT '' NOT NULL,
	`quantity` real,
	`unit` text DEFAULT '' NOT NULL,
	`estimate_min` integer,
	`due_at` text,
	`priority` text DEFAULT 'normal' NOT NULL,
	`attention` text DEFAULT 'focus' NOT NULL,
	`today_order` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` text,
	`completion_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignment`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "task_priority" CHECK("task"."priority" in ('low', 'normal', 'high')),
	CONSTRAINT "task_attention" CHECK("task"."attention" in ('focus', 'light', 'background')),
	CONSTRAINT "task_status" CHECK("task"."status" in ('open', 'done')),
	CONSTRAINT "task_completed" CHECK(("task"."status" = 'done') = ("task"."completed_at" is not null)),
	CONSTRAINT "task_quantity" CHECK("task"."quantity" is null or "task"."quantity" >= 0),
	CONSTRAINT "task_estimate" CHECK("task"."estimate_min" is null or "task"."estimate_min" >= 0)
);
--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `task` (`parent_id`);--> statement-breakpoint
CREATE INDEX `task_course_idx` ON `task` (`course_id`);--> statement-breakpoint
CREATE INDEX `task_assignment_idx` ON `task` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `task` (`status`);--> statement-breakpoint
CREATE TABLE `time_session` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`start_at` text NOT NULL,
	`end_at` text,
	`source` text DEFAULT 'desktop' NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "time_session_source" CHECK("time_session"."source" in ('desktop', 'phone', 'manual')),
	CONSTRAINT "time_session_order" CHECK("time_session"."end_at" is null or julianday("time_session"."end_at") > julianday("time_session"."start_at"))
);
--> statement-breakpoint
CREATE INDEX `time_session_task_idx` ON `time_session` (`task_id`);--> statement-breakpoint
CREATE INDEX `time_session_start_idx` ON `time_session` (`start_at`);--> statement-breakpoint
CREATE INDEX `time_session_open_idx` ON `time_session` (`end_at`);