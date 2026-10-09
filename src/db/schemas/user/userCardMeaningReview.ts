import type { Rating, State } from "ts-fsrs";
import { index, integer, sqliteTable, real } from "drizzle-orm/sqlite-core";
import { cardMeaningTable } from "../card/cardMeaning";
import { userCardMeaningTable } from "./userCardMeaning";
import { userTable } from "./user";

export const userCardMeaningReviewTable = sqliteTable(
  "user_card_meaning_review",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),

    cardMeaningId: integer("card_meaning_id")
      .notNull()
      .references(() => cardMeaningTable.id, {
        onDelete: "cascade",
      }),

    userCardMeaningId: integer("user_card_meaning_id")
      .notNull()
      .references(() => userCardMeaningTable.id, {
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
    index("user_card_meaning_reviews_user_index").on(table.review),
    index("user_card_meaning_reviews_user_state_index").on(
      table.state,
      table.review,
    ),
    index("user_card_meaning_reviews_progress_index").on(
      table.userCardMeaningId,
      table.review,
    ),
    index("user_card_meaning_reviews_meaning_index").on(
      table.cardMeaningId,
      table.review,
    ),
  ],
);
