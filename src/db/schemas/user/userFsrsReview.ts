import type { Rating, State } from "ts-fsrs";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  real,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";
import {
  finiteNumber,
  nonNegativeInteger,
  timestampMillis,
} from "../../schemaChecks";

export const userFsrsReviewTable = sqliteTable(
  "user_fsrs_review",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),

    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, {
        onDelete: "cascade",
      }),

    rating: integer("rating").$type<Rating>().notNull(),

    state: integer("state").$type<State>().notNull(),

    due: integer("due", { mode: "timestamp_ms" }).notNull(),

    stability: real("stability").notNull(),

    difficulty: real("difficulty").notNull(),

    scheduledDays: integer("scheduled_days").notNull(),

    elapsedDays: integer("elapsed_days").notNull(),

    lastElapsedDays: integer("last_elapsed_days").notNull(),

    learningSteps: integer("learning_steps").notNull(),

    review: integer("review", { mode: "timestamp_ms" }).notNull(),

    // Compute on the OLD Card at review time, before scheduler.next().
    // NULL for first exposure, manual events, or unavailable historical data.
    retrievabilityBefore: real("retrievability_before"),
  },
  (table) => [
    index("user_card_meaning_reviews_user_index").on(
      table.userId,
      table.review,
    ),
    index("user_card_meaning_reviews_user_state_index").on(
      table.userId,
      table.state,
      table.review,
    ),
    index("user_fsrs_review_user_meaning_review_index").on(
      table.userId,
      table.wordMeaningId,
      table.review,
    ),
    index("user_fsrs_review_meaning_index").on(table.wordMeaningId),
    // Manual=0 remains valid for imported/manual review events.
    check(
      "user_fsrs_review_rating_check",
      sql`${table.rating} IN (0, 1, 2, 3, 4)`,
    ),
    check("user_fsrs_review_state_check", sql`${table.state} IN (0, 1, 2, 3)`),
    // ReviewLog is the BEFORE snapshot: the first review still has S=D=0.
    check(
      "user_fsrs_review_memory_check",
      sql`(${table.state} = 0 AND ${table.stability} = 0 AND ${table.difficulty} = 0) OR (${table.state} <> 0 AND ${table.stability} > 0 AND ${finiteNumber(table.stability)} AND ${table.difficulty} BETWEEN 1 AND 10)`,
    ),
    check(
      "user_fsrs_review_intervals_check",
      sql`${nonNegativeInteger(table.scheduledDays)} AND ${nonNegativeInteger(table.elapsedDays)} AND ${nonNegativeInteger(table.lastElapsedDays)} AND ${nonNegativeInteger(table.learningSteps)}`,
    ),
    check(
      "user_fsrs_review_dates_check",
      sql`${timestampMillis(table.due)} AND ${timestampMillis(table.review)}`,
    ),
    check(
      "user_fsrs_review_retrievability_check",
      sql`${table.retrievabilityBefore} IS NULL OR ${table.retrievabilityBefore} BETWEEN 0 AND 1`,
    ),
  ],
);
