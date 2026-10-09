CREATE TABLE `attribute` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
);
--> statement-breakpoint
CREATE TABLE `card` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`deck_id` integer NOT NULL,
	`title` text NOT NULL,
	`transcription` text,
	`audio_url` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT `fk_card_deck_id_deck_id_fk` FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `card_example` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`card_meaning_id` integer NOT NULL,
	`example` text NOT NULL,
	`example_translation` text NOT NULL,
	CONSTRAINT `fk_card_example_card_meaning_id_card_meaning_id_fk` FOREIGN KEY (`card_meaning_id`) REFERENCES `card_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `card_meaning` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`card_id` integer NOT NULL,
	`hint` text,
	`meaning` text NOT NULL,
	`meaning_translation` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT `fk_card_meaning_card_id_card_id_fk` FOREIGN KEY (`card_id`) REFERENCES `card`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `card_meaning_attribute` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`card_meaning_id` integer NOT NULL,
	`attribute_id` integer NOT NULL,
	`value` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT `fk_card_meaning_attribute_card_meaning_id_card_meaning_id_fk` FOREIGN KEY (`card_meaning_id`) REFERENCES `card_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_card_meaning_attribute_attribute_id_attribute_id_fk` FOREIGN KEY (`attribute_id`) REFERENCES `attribute`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `deck` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text
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
CREATE TABLE `user_card_meaning` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`card_meaning_id` integer NOT NULL,
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
	CONSTRAINT `fk_user_card_meaning_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_card_meaning_card_meaning_id_card_meaning_id_fk` FOREIGN KEY (`card_meaning_id`) REFERENCES `card_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_card_meaning_review` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`card_meaning_id` integer NOT NULL,
	`user_card_meaning_id` integer NOT NULL,
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
	CONSTRAINT `fk_user_card_meaning_review_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_card_meaning_review_card_meaning_id_card_meaning_id_fk` FOREIGN KEY (`card_meaning_id`) REFERENCES `card_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_card_meaning_review_user_card_meaning_id_user_card_meaning_id_fk` FOREIGN KEY (`user_card_meaning_id`) REFERENCES `user_card_meaning`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_deck` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`deck_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`last_reviewed_at` integer,
	CONSTRAINT `fk_user_deck_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_deck_deck_id_deck_id_fk` FOREIGN KEY (`deck_id`) REFERENCES `deck`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_user_settings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `cards_deck_id_index` ON `card` (`deck_id`);--> statement-breakpoint
CREATE INDEX `card_examples_card_meaning_id_index` ON `card_example` (`card_meaning_id`);--> statement-breakpoint
CREATE INDEX `card_meanings_card_id_index` ON `card_meaning` (`card_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_meaning_attribute_unique` ON `card_meaning_attribute` (`card_meaning_id`,`attribute_id`,`value`);--> statement-breakpoint
CREATE INDEX `card_meaning_attributes_attribute_index` ON `card_meaning_attribute` (`attribute_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_due_index` ON `user_card_meaning` (`user_id`,`due`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_card_meanings_user_meaning_unique` ON `user_card_meaning` (`user_id`,`card_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_card_meaning_index` ON `user_card_meaning` (`card_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_index` ON `user_card_meaning_review` (`user_id`,`review`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_state_index` ON `user_card_meaning_review` (`user_id`,`state`,`review`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_progress_index` ON `user_card_meaning_review` (`user_card_meaning_id`,`review`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_meaning_index` ON `user_card_meaning_review` (`card_meaning_id`,`review`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_decks_deck_unique` ON `user_deck` (`user_id`,`deck_id`);--> statement-breakpoint
CREATE INDEX `user_decks_deck_id_index` ON `user_deck` (`deck_id`);--> statement-breakpoint
CREATE INDEX `user_settings_user_id_index` ON `user_settings` (`user_id`);