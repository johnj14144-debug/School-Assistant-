-- Hand-fixed: drizzle-kit copied the new column "kind" from the old table, which doesn't have it
-- ("no such column"), so the migration always failed. Existing categories become 'regular'.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_grade_category` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'regular' NOT NULL,
	`weight` real DEFAULT 0 NOT NULL,
	`drop_lowest` integer DEFAULT 0 NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "grade_category_kind" CHECK("__new_grade_category"."kind" in ('regular', 'bonus')),
	CONSTRAINT "grade_category_weight" CHECK("__new_grade_category"."weight" >= 0),
	CONSTRAINT "grade_category_drop_lowest" CHECK("__new_grade_category"."drop_lowest" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_grade_category`("id", "course_id", "name", "kind", "weight", "drop_lowest", "position") SELECT "id", "course_id", "name", 'regular', "weight", "drop_lowest", "position" FROM `grade_category`;--> statement-breakpoint
DROP TABLE `grade_category`;--> statement-breakpoint
ALTER TABLE `__new_grade_category` RENAME TO `grade_category`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `grade_category_course_idx` ON `grade_category` (`course_id`);