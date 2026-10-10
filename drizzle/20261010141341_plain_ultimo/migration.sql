CREATE TABLE `cefr_level` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`value` text NOT NULL UNIQUE,
	CONSTRAINT "cefr_level_value_check" CHECK("value" IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'))
);
--> statement-breakpoint
CREATE TABLE `part_of_speech` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`value` text NOT NULL,
	CONSTRAINT "part_of_speech_value_check" CHECK(length(trim("value", char(9) || char(10) || char(13) || ' ')) > 0)
);
--> statement-breakpoint
CREATE TABLE `topic` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`description` text,
	CONSTRAINT "topic_name_check" CHECK(length(trim("name", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "topic_slug_check" CHECK(length("slug") > 0 AND "slug" NOT GLOB '*[^a-z0-9-]*' AND "slug" NOT LIKE '-%' AND "slug" NOT LIKE '%-')
);
--> statement-breakpoint
CREATE TABLE `word` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`title` text NOT NULL,
	`transcription` text,
	`audio_url` text,
	`frequency_rank` integer,
	`frequency_source` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT "word_title_check" CHECK(length(trim("title", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_frequency_rank_check" CHECK("frequency_rank" IS NULL OR (typeof("frequency_rank") = 'integer' AND "frequency_rank" >= 0 AND "frequency_rank" >= 1)),
	CONSTRAINT "word_frequency_source_check" CHECK("frequency_rank" IS NULL OR ("frequency_source" IS NOT NULL AND length(trim("frequency_source", char(9) || char(10) || char(13) || ' ')) > 0))
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
	`vocabulary_difficulty` real,
	`is_recommendable` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text,
	CONSTRAINT `fk_word_meaning_word_id_word_id_fk` FOREIGN KEY (`word_id`) REFERENCES `word`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_word_meaning_part_of_speech_id_part_of_speech_id_fk` FOREIGN KEY (`part_of_speech_id`) REFERENCES `part_of_speech`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_word_meaning_cefr_level_id_cefr_level_id_fk` FOREIGN KEY (`cefr_level_id`) REFERENCES `cefr_level`(`id`) ON DELETE RESTRICT,
	CONSTRAINT "word_meaning_recommendable_check" CHECK("is_recommendable" IN (0, 1)),
	CONSTRAINT "word_meaning_meaning_check" CHECK(length(trim("meaning", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_meaning_translation_check" CHECK(length(trim("meaning_translation", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_meaning_difficulty_check" CHECK("vocabulary_difficulty" IS NULL OR "vocabulary_difficulty" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308)
);
--> statement-breakpoint
CREATE TABLE `word_meaning_example` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`word_meaning_id` integer NOT NULL,
	`example` text NOT NULL,
	`example_translation` text NOT NULL,
	CONSTRAINT `fk_word_meaning_example_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "word_meaning_example_text_check" CHECK(length(trim("example", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_meaning_example_translation_check" CHECK(length(trim("example_translation", char(9) || char(10) || char(13) || ' ')) > 0)
);
--> statement-breakpoint
CREATE TABLE `word_meaning_topic` (
	`word_meaning_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	`relevance` real DEFAULT 1 NOT NULL,
	CONSTRAINT `word_meaning_topic_pk` PRIMARY KEY(`word_meaning_id`, `topic_id`),
	CONSTRAINT `fk_word_meaning_topic_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_word_meaning_topic_topic_id_topic_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON DELETE CASCADE,
	CONSTRAINT "word_meaning_topic_relevance_check" CHECK("relevance" > 0 AND "relevance" <= 1)
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
	`updated_at` text,
	CONSTRAINT "user_telegram_id_check" CHECK(typeof("telegram_id") = 'integer' AND "telegram_id" >= 0 AND "telegram_id" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "user_is_admin_check" CHECK("is_admin" IN (0, 1))
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
	`introduced_at` integer,
	CONSTRAINT `fk_user_fsrs_data_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_fsrs_data_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_fsrs_data_state_check" CHECK("state" IN (0, 1, 2, 3)),
	CONSTRAINT "user_fsrs_data_memory_check" CHECK(("state" = 0 AND "stability" = 0 AND "difficulty" = 0) OR ("state" <> 0 AND "stability" > 0 AND "stability" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 AND "difficulty" BETWEEN 1 AND 10)),
	CONSTRAINT "user_fsrs_data_counters_check" CHECK(typeof("reps") = 'integer' AND "reps" >= 0 AND typeof("lapses") = 'integer' AND "lapses" >= 0 AND "lapses" <= "reps" AND typeof("learning_steps") = 'integer' AND "learning_steps" >= 0),
	CONSTRAINT "user_fsrs_data_intervals_check" CHECK(typeof("elapsed_days") = 'integer' AND "elapsed_days" >= 0 AND typeof("scheduled_days") = 'integer' AND "scheduled_days" >= 0),
	CONSTRAINT "user_fsrs_data_dates_check" CHECK(typeof("due") = 'integer' AND "due" >= 0 AND "due" <= 8640000000000000 AND ("last_review" IS NULL OR typeof("last_review") = 'integer' AND "last_review" >= 0 AND "last_review" <= 8640000000000000) AND ("introduced_at" IS NULL OR typeof("introduced_at") = 'integer' AND "introduced_at" >= 0 AND "introduced_at" <= 8640000000000000)),
	CONSTRAINT "user_fsrs_data_last_review_check" CHECK("state" = 0 OR "last_review" IS NOT NULL)
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
	`retrievability_before` real,
	CONSTRAINT `fk_user_fsrs_review_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_fsrs_review_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_fsrs_review_rating_check" CHECK("rating" IN (0, 1, 2, 3, 4)),
	CONSTRAINT "user_fsrs_review_state_check" CHECK("state" IN (0, 1, 2, 3)),
	CONSTRAINT "user_fsrs_review_memory_check" CHECK(("state" = 0 AND "stability" = 0 AND "difficulty" = 0) OR ("state" <> 0 AND "stability" > 0 AND "stability" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 AND "difficulty" BETWEEN 1 AND 10)),
	CONSTRAINT "user_fsrs_review_intervals_check" CHECK(typeof("scheduled_days") = 'integer' AND "scheduled_days" >= 0 AND typeof("elapsed_days") = 'integer' AND "elapsed_days" >= 0 AND typeof("last_elapsed_days") = 'integer' AND "last_elapsed_days" >= 0 AND typeof("learning_steps") = 'integer' AND "learning_steps" >= 0),
	CONSTRAINT "user_fsrs_review_dates_check" CHECK(typeof("due") = 'integer' AND "due" >= 0 AND "due" <= 8640000000000000 AND typeof("review") = 'integer' AND "review" >= 0 AND "review" <= 8640000000000000),
	CONSTRAINT "user_fsrs_review_retrievability_check" CHECK("retrievability_before" IS NULL OR "retrievability_before" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE `user_recommendation_profile` (
	`user_id` integer PRIMARY KEY,
	`self_reported_cefr_level_id` integer,
	`vocabulary_ability` real DEFAULT -2 NOT NULL,
	`assessment_weight` real DEFAULT 0 NOT NULL,
	`daily_new_meaning_limit` integer DEFAULT 10 NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`exploration_rate` real DEFAULT 0.1 NOT NULL,
	`algorithm_version` text DEFAULT 'content-v1' NOT NULL,
	`stats_updated_at` integer,
	`updated_at` text,
	CONSTRAINT `fk_user_recommendation_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_recommendation_profile_self_reported_cefr_level_id_cefr_level_id_fk` FOREIGN KEY (`self_reported_cefr_level_id`) REFERENCES `cefr_level`(`id`) ON DELETE SET NULL,
	CONSTRAINT "user_recommendation_profile_assessment_weight_check" CHECK("assessment_weight" >= 0 AND "assessment_weight" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
	CONSTRAINT "user_recommendation_profile_daily_limit_check" CHECK(typeof("daily_new_meaning_limit") = 'integer' AND "daily_new_meaning_limit" >= 0),
	CONSTRAINT "user_recommendation_profile_exploration_check" CHECK("exploration_rate" BETWEEN 0 AND 1),
	CONSTRAINT "user_recommendation_profile_ability_check" CHECK("vocabulary_ability" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
	CONSTRAINT "user_recommendation_profile_timezone_check" CHECK(length(trim("timezone", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "user_recommendation_profile_version_check" CHECK(length(trim("algorithm_version", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "user_recommendation_profile_stats_date_check" CHECK("stats_updated_at" IS NULL OR typeof("stats_updated_at") = 'integer' AND "stats_updated_at" >= 0 AND "stats_updated_at" <= 8640000000000000)
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	CONSTRAINT `fk_user_settings_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_settings_key_check" CHECK(length(trim("key", char(9) || char(10) || char(13) || ' ')) > 0)
);
--> statement-breakpoint
CREATE TABLE `user_topic_profile` (
	`user_id` integer NOT NULL,
	`topic_id` integer NOT NULL,
	`interest_weight` real DEFAULT 0 NOT NULL,
	`is_blocked` integer DEFAULT false NOT NULL,
	`vocabulary_ability_offset` real DEFAULT 0 NOT NULL,
	`assessment_weight` real DEFAULT 0 NOT NULL,
	`recall_residual_sum` real DEFAULT 0 NOT NULL,
	`recall_weight` real DEFAULT 0 NOT NULL,
	`distinct_reviewed_meanings` integer DEFAULT 0 NOT NULL,
	`stats_updated_at` integer,
	`updated_at` text,
	CONSTRAINT `user_topic_profile_pk` PRIMARY KEY(`user_id`, `topic_id`),
	CONSTRAINT `fk_user_topic_profile_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_topic_profile_topic_id_topic_id_fk` FOREIGN KEY (`topic_id`) REFERENCES `topic`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_topic_profile_interest_check" CHECK("interest_weight" BETWEEN -1 AND 1),
	CONSTRAINT "user_topic_profile_blocked_check" CHECK("is_blocked" IN (0, 1)),
	CONSTRAINT "user_topic_profile_evidence_check" CHECK("assessment_weight" >= 0 AND "assessment_weight" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 AND "recall_weight" >= 0 AND "recall_weight" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308 AND typeof("distinct_reviewed_meanings") = 'integer' AND "distinct_reviewed_meanings" >= 0),
	CONSTRAINT "user_topic_profile_residual_check" CHECK(abs("recall_residual_sum") <= "recall_weight" + 0.000001),
	CONSTRAINT "user_topic_profile_ability_check" CHECK("vocabulary_ability_offset" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
	CONSTRAINT "user_topic_profile_stats_date_check" CHECK("stats_updated_at" IS NULL OR typeof("stats_updated_at") = 'integer' AND "stats_updated_at" >= 0 AND "stats_updated_at" <= 8640000000000000)
);
--> statement-breakpoint
CREATE TABLE `user_vocabulary_assessment` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`word_meaning_id` integer NOT NULL,
	`knew_before` integer NOT NULL,
	`source` text NOT NULL,
	`vocabulary_difficulty` real NOT NULL,
	`topic_weights` text DEFAULT '[]' NOT NULL,
	`assessed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `fk_user_vocabulary_assessment_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_vocabulary_assessment_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_vocabulary_assessment_knew_check" CHECK("knew_before" IN (0, 1)),
	CONSTRAINT "user_vocabulary_assessment_source_check" CHECK("source" IN ('recognition_test', 'self_report')),
	CONSTRAINT "user_vocabulary_assessment_topics_check" CHECK(json_valid("topic_weights") AND json_type("topic_weights") = 'array'),
	CONSTRAINT "user_vocabulary_assessment_difficulty_check" CHECK("vocabulary_difficulty" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
	CONSTRAINT "user_vocabulary_assessment_date_check" CHECK(typeof("assessed_at") = 'integer' AND "assessed_at" >= 0 AND "assessed_at" <= 8640000000000000)
);
--> statement-breakpoint
CREATE TABLE `user_word_preference` (
	`user_id` integer NOT NULL,
	`word_meaning_id` integer NOT NULL,
	`status` text NOT NULL,
	`snoozed_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT `user_word_preference_pk` PRIMARY KEY(`user_id`, `word_meaning_id`),
	CONSTRAINT `fk_user_word_preference_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_word_preference_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "user_word_preference_status_check" CHECK("status" IN ('known', 'ignored', 'snoozed')),
	CONSTRAINT "user_word_preference_snooze_check" CHECK(("status" = 'snoozed' AND "snoozed_until" IS NOT NULL) OR ("status" <> 'snoozed' AND "snoozed_until" IS NULL)),
	CONSTRAINT "user_word_preference_dates_check" CHECK(typeof("created_at") = 'integer' AND "created_at" >= 0 AND "created_at" <= 8640000000000000 AND typeof("updated_at") = 'integer' AND "updated_at" >= 0 AND "updated_at" <= 8640000000000000 AND "updated_at" >= "created_at" AND ("snoozed_until" IS NULL OR (typeof("snoozed_until") = 'integer' AND "snoozed_until" >= 0 AND "snoozed_until" <= 8640000000000000 AND "snoozed_until" > "created_at")))
);
--> statement-breakpoint
CREATE TABLE `word_recommendation` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` integer NOT NULL,
	`word_meaning_id` integer NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`algorithm_version` text NOT NULL,
	`reason` text NOT NULL,
	`predicted_known_probability` real NOT NULL,
	`score` real NOT NULL,
	`score_components` text NOT NULL,
	`selection_probability` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`shown_at` integer,
	`feedback` text,
	`feedback_at` integer,
	CONSTRAINT `fk_word_recommendation_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_word_recommendation_word_meaning_id_word_meaning_id_fk` FOREIGN KEY (`word_meaning_id`) REFERENCES `word_meaning`(`id`) ON DELETE CASCADE,
	CONSTRAINT "word_recommendation_position_check" CHECK(typeof("position") = 'integer' AND "position" >= 0 AND "position" >= 1),
	CONSTRAINT "word_recommendation_probability_check" CHECK("predicted_known_probability" BETWEEN 0 AND 1 AND "selection_probability" > 0 AND "selection_probability" <= 1),
	CONSTRAINT "word_recommendation_reason_check" CHECK("reason" IN ('level_match', 'interest', 'weak_topic', 'exploration')),
	CONSTRAINT "word_recommendation_feedback_check" CHECK("feedback" IS NULL OR "feedback" IN ('accepted', 'already_known', 'skipped', 'too_difficult', 'not_interested')),
	CONSTRAINT "word_recommendation_feedback_time_check" CHECK(("feedback" IS NULL AND "feedback_at" IS NULL) OR ("feedback" IS NOT NULL AND "feedback_at" IS NOT NULL AND "shown_at" IS NOT NULL AND "feedback_at" >= "shown_at")),
	CONSTRAINT "word_recommendation_lifetime_check" CHECK("expires_at" > "created_at" AND ("shown_at" IS NULL OR ("shown_at" >= "created_at" AND "shown_at" <= "expires_at"))),
	CONSTRAINT "word_recommendation_components_check" CHECK(json_valid("score_components") AND json_type("score_components") = 'object'),
	CONSTRAINT "word_recommendation_score_check" CHECK("score" BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
	CONSTRAINT "word_recommendation_batch_check" CHECK(length(trim("batch_id", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_recommendation_version_check" CHECK(length(trim("algorithm_version", char(9) || char(10) || char(13) || ' ')) > 0),
	CONSTRAINT "word_recommendation_dates_check" CHECK(typeof("created_at") = 'integer' AND "created_at" >= 0 AND "created_at" <= 8640000000000000 AND typeof("expires_at") = 'integer' AND "expires_at" >= 0 AND "expires_at" <= 8640000000000000 AND ("shown_at" IS NULL OR typeof("shown_at") = 'integer' AND "shown_at" >= 0 AND "shown_at" <= 8640000000000000) AND ("feedback_at" IS NULL OR typeof("feedback_at") = 'integer' AND "feedback_at" >= 0 AND "feedback_at" <= 8640000000000000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `part_of_speech_value_unique` ON `part_of_speech` (lower(trim("value")));--> statement-breakpoint
CREATE INDEX `word_title_index` ON `word` (`title`);--> statement-breakpoint
CREATE INDEX `word_meaning_word_id_index` ON `word_meaning` (`word_id`);--> statement-breakpoint
CREATE INDEX `word_meaning_cefr_recommendable_index` ON `word_meaning` (`cefr_level_id`,`is_recommendable`);--> statement-breakpoint
CREATE INDEX `word_meaning_part_of_speech_index` ON `word_meaning` (`part_of_speech_id`);--> statement-breakpoint
CREATE INDEX `word_meaning_examples_word_meaning_id_index` ON `word_meaning_example` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `word_meaning_topic_topic_index` ON `word_meaning_topic` (`topic_id`,`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_due_index` ON `user_fsrs_data` (`user_id`,`due`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_card_meanings_user_meaning_unique` ON `user_fsrs_data` (`user_id`,`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_card_meanings_card_meaning_index` ON `user_fsrs_data` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_fsrs_data_user_introduced_index` ON `user_fsrs_data` (`user_id`,`introduced_at`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_index` ON `user_fsrs_review` (`user_id`,`review`);--> statement-breakpoint
CREATE INDEX `user_card_meaning_reviews_user_state_index` ON `user_fsrs_review` (`user_id`,`state`,`review`);--> statement-breakpoint
CREATE INDEX `user_fsrs_review_user_meaning_review_index` ON `user_fsrs_review` (`user_id`,`word_meaning_id`,`review`);--> statement-breakpoint
CREATE INDEX `user_fsrs_review_meaning_index` ON `user_fsrs_review` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_recommendation_profile_cefr_index` ON `user_recommendation_profile` (`self_reported_cefr_level_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_key_unique` ON `user_settings` (`user_id`,`key`);--> statement-breakpoint
CREATE INDEX `user_topic_profile_topic_index` ON `user_topic_profile` (`topic_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_vocabulary_assessment_user_meaning_unique` ON `user_vocabulary_assessment` (`user_id`,`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_vocabulary_assessment_user_time_index` ON `user_vocabulary_assessment` (`user_id`,`assessed_at`);--> statement-breakpoint
CREATE INDEX `user_vocabulary_assessment_meaning_index` ON `user_vocabulary_assessment` (`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `user_word_preference_meaning_index` ON `user_word_preference` (`word_meaning_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_recommendation_batch_position_unique` ON `word_recommendation` (`user_id`,`batch_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `word_recommendation_batch_meaning_unique` ON `word_recommendation` (`user_id`,`batch_id`,`word_meaning_id`);--> statement-breakpoint
CREATE INDEX `word_recommendation_user_meaning_shown_index` ON `word_recommendation` (`user_id`,`word_meaning_id`,`shown_at`);--> statement-breakpoint
CREATE INDEX `word_recommendation_user_shown_index` ON `word_recommendation` (`user_id`,`shown_at`);--> statement-breakpoint
CREATE INDEX `word_recommendation_meaning_index` ON `word_recommendation` (`word_meaning_id`);