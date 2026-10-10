import type { State } from "ts-fsrs";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";
import {
  finiteNumber,
  nonNegativeInteger,
  timestampMillis,
} from "../../schemaChecks";

export const userFsrsDataTable = sqliteTable(
  "user_fsrs_data",
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

    due: integer("due", { mode: "timestamp_ms" }).notNull(),

    stability: real("stability").notNull(),

    difficulty: real("difficulty").notNull(),

    elapsedDays: integer("elapsed_days").notNull(),

    scheduledDays: integer("scheduled_days").notNull(),

    learningSteps: integer("learning_steps").notNull(),

    reps: integer("reps").notNull(),

    lapses: integer("lapses").notNull(),

    state: integer("state").$type<State>().notNull(),

    lastReview: integer("last_review", { mode: "timestamp_ms" }),

    // Set once when a meaning enters learning. NULL is allowed for legacy rows.
    introducedAt: integer("introduced_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("user_card_meanings_due_index").on(table.userId, table.due),
    uniqueIndex("user_card_meanings_user_meaning_unique").on(
      table.userId,
      table.wordMeaningId,
    ),
    index("user_card_meanings_card_meaning_index").on(table.wordMeaningId),
    index("user_fsrs_data_user_introduced_index").on(
      table.userId,
      table.introducedAt,
    ),
    check("user_fsrs_data_state_check", sql`${table.state} IN (0, 1, 2, 3)`),
    // createEmptyCard() has zero memory values. Learned cards have D in [1,10].
    check(
      "user_fsrs_data_memory_check",
      sql`(${table.state} = 0 AND ${table.stability} = 0 AND ${table.difficulty} = 0) OR (${table.state} <> 0 AND ${table.stability} > 0 AND ${finiteNumber(table.stability)} AND ${table.difficulty} BETWEEN 1 AND 10)`,
    ),
    check(
      "user_fsrs_data_counters_check",
      sql`${nonNegativeInteger(table.reps)} AND ${nonNegativeInteger(table.lapses)} AND ${table.lapses} <= ${table.reps} AND ${nonNegativeInteger(table.learningSteps)}`,
    ),
    check(
      "user_fsrs_data_intervals_check",
      sql`${nonNegativeInteger(table.elapsedDays)} AND ${nonNegativeInteger(table.scheduledDays)}`,
    ),
    check(
      "user_fsrs_data_dates_check",
      sql`${timestampMillis(table.due)} AND (${table.lastReview} IS NULL OR ${timestampMillis(table.lastReview)}) AND (${table.introducedAt} IS NULL OR ${timestampMillis(table.introducedAt)})`,
    ),
    check(
      "user_fsrs_data_last_review_check",
      sql`${table.state} = 0 OR ${table.lastReview} IS NOT NULL`,
    ),
  ],
);
