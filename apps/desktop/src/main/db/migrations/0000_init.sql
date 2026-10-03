CREATE TABLE `assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`category_id` text,
	`title` text NOT NULL,
	`due_at` text,
	`points_possible` real NOT NULL,
	`points_earned` real,
	`extra_credit` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `grade_category`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "assignment_points_possible" CHECK("assignment"."points_possible" >= 0),
	CONSTRAINT "assignment_points_earned" CHECK("assignment"."points_earned" is null or "assignment"."points_earned" >= 0)
);
--> statement-breakpoint
CREATE INDEX `assignment_course_idx` ON `assignment` (`course_id`);--> statement-breakpoint
CREATE INDEX `assignment_category_idx` ON `assignment` (`category_id`);--> statement-breakpoint
CREATE INDEX `assignment_due_idx` ON `assignment` (`due_at`);--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`term` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'enrolled' NOT NULL,
	`grading` text NOT NULL,
	`letter_scale` text NOT NULL,
	`color` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "course_kind" CHECK("course"."kind" in ('enrolled', 'self_study')),
	CONSTRAINT "course_grading" CHECK("course"."grading" in ('weighted', 'points'))
);
--> statement-breakpoint
CREATE TABLE `grade_category` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`drop_lowest` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "grade_category_weight" CHECK("grade_category"."weight" >= 0),
	CONSTRAINT "grade_category_drop_lowest" CHECK("grade_category"."drop_lowest" >= 0)
);
--> statement-breakpoint
CREATE INDEX `grade_category_course_idx` ON `grade_category` (`course_id`);--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
