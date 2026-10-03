-- Hand-fixed: drizzle-kit copied the new columns (deadline, earliest_start_at, splittable,
-- min_chunk_min, steps) from the old table, which doesn't have them. Every task now has a due
-- date (owner decision Q11): one without gets a soft deadline, at its completion time if done,
-- else 11:59 PM local a week after the upgrade. Existing due dates stay hard.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_task` (
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
	`due_at` text NOT NULL,
	`deadline` text DEFAULT 'hard' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`attention` text DEFAULT 'focus' NOT NULL,
	`today_order` integer,
	`earliest_start_at` text,
	`splittable` integer DEFAULT true NOT NULL,
	`min_chunk_min` integer DEFAULT 30 NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`completed_at` text,
	`completion_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignment`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "task_priority" CHECK("__new_task"."priority" in ('low', 'normal', 'high')),
	CONSTRAINT "task_attention" CHECK("__new_task"."attention" in ('focus', 'light', 'background')),
	CONSTRAINT "task_deadline" CHECK("__new_task"."deadline" in ('hard', 'soft')),
	CONSTRAINT "task_min_chunk" CHECK("__new_task"."min_chunk_min" >= 5),
	CONSTRAINT "task_status" CHECK("__new_task"."status" in ('open', 'done')),
	CONSTRAINT "task_completed" CHECK(("__new_task"."status" = 'done') = ("__new_task"."completed_at" is not null)),
	CONSTRAINT "task_quantity" CHECK("__new_task"."quantity" is null or "__new_task"."quantity" >= 0),
	CONSTRAINT "task_estimate" CHECK("__new_task"."estimate_min" is null or "__new_task"."estimate_min" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_task`("id", "parent_id", "title", "description", "course_id", "assignment_id", "type", "quantity", "unit", "estimate_min", "due_at", "deadline", "priority", "attention", "today_order", "earliest_start_at", "splittable", "min_chunk_min", "steps", "status", "completed_at", "completion_note", "created_at", "updated_at") SELECT "id", "parent_id", "title", "description", "course_id", "assignment_id", "type", "quantity", "unit", "estimate_min", coalesce("due_at", "completed_at", strftime('%Y-%m-%dT%H:%M:%fZ', date('now', 'localtime', '+7 days') || ' 23:59:00', 'utc')), CASE WHEN "due_at" IS NULL THEN 'soft' ELSE 'hard' END, "priority", "attention", "today_order", NULL, 1, 30, '[]', "status", "completed_at", "completion_note", "created_at", "updated_at" FROM `task`;--> statement-breakpoint
DROP TABLE `task`;--> statement-breakpoint
ALTER TABLE `__new_task` RENAME TO `task`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `task` (`parent_id`);--> statement-breakpoint
CREATE INDEX `task_course_idx` ON `task` (`course_id`);--> statement-breakpoint
CREATE INDEX `task_assignment_idx` ON `task` (`assignment_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `task` (`status`);--> statement-breakpoint
ALTER TABLE `block` ADD `kind` text DEFAULT 'work' NOT NULL;