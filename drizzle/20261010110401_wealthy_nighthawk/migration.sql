CREATE TABLE `cefr_level` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `part_of_speech` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`title` text NOT NULL,
	`transcription` text,
	`audio_url` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `word_meaning` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`word_id` integer NOT NULL,
	`part_of_speech_id` integer NOT NULL,
	`cefr_level_id` integer NOT NULL,
	`hint` text,
	`meaning` text NOT NULL,
	`meaning_translation` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT `fk_word_meaning_word_id_word_id_fk` FOREIGN KEY (`word_id`) REFERENCES `word`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_word_meaning_part_of_speech_id_part_of_speech_id_fk` FOREIGN KEY (`part_of_speech_id`) REFERENCES `part_of_speech`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_word_meaning_cefr_level_id_cefr_level_id_fk` FOREIGN KEY (`cefr_level_id`) REFERENCES `cefr_level`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `word_meaning_example` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`word_meaning_id` integer NOT NULL,
	`example` text NOT NULL,
	`example_translation` text NOT NULL,
	CONSTRAINT `fk_word_meaning_example_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`telegram_id` integer NOT NULL UNIQUE,
	`username` text,
	`first_name` text,
	`last_name` text,
	`is_admin` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `user_fsrs_data` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`word_meaning_id` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`elapsed_days` integer NOT NULL,
	`scheduled_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	`reps` integer NOT NULL,
	`lapses` integer NOT NULL,
	`state` integer NOT NULL,
	`last_review` integer,
	CONSTRAINT `fk_user_fsrs_data_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_fsrs_data_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_fsrs_review` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`word_meaning_id` integer NOT NULL,
	`rating` integer NOT NULL,
	`state` integer NOT NULL,
	`due` integer NOT NULL,
	`stability` real NOT NULL,
	`difficulty` real NOT NULL,
	`scheduled_days` integer NOT NULL,
	`elapsed_days` integer NOT NULL,
	`last_elapsed_days` integer NOT NULL,
	`learning_steps` integer NOT NULL,
	`review` integer NOT NULL,
	CONSTRAINT `fk_user_fsrs_review_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_fsrs_review_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_user_settings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `word_meaning_word_id_index` ON `word_meaning` (`word_id`);--> statement-breakpoint
CREATE INDEX `word_meaning_examples_word_meaning_id_index` ON `word_meaning_example` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_due_index` ON `user_fsrs_data` (`user_id`,`due`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_card_meanings_user_meaning_unique` ON `user_fsrs_data` (`user_id`,`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_card_meaning_index` ON `user_fsrs_data` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_index` ON `user_fsrs_review` (`user_id`,`review`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_state_index` ON `user_fsrs_review` (`user_id`,`state`,`review`);--> statement-breakpoint
CREATE INDEX `user_settings_user_id_index` ON `user_settings` (`user_id`);