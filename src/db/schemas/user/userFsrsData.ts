import type { State } from "ts-fsrs";
import {
  index,
  integer,
  sqliteTable,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";

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
  },
  (table) => [
    index("user_card_meanings_due_index").on(table.userId, table.due),
    uniqueIndex("user_card_meanings_user_meaning_unique").on(
      table.userId,
      table.wordMeaningId,
    ),
    index("user_card_meanings_card_meaning_index").on(table.wordMeaningId),
  ],
);
