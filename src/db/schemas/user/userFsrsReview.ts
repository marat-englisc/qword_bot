import type { Rating, State } from "ts-fsrs";
import { index, integer, sqliteTable, real } from "drizzle-orm/sqlite-core";
import { userTable } from "./user";
import { wordMeaningTable } from "../card/wordMeaning";

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
  ],
);
