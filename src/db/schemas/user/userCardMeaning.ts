import type { State } from "ts-fsrs";
import {
  index,
  integer,
  sqliteTable,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { cardMeaningTable } from "../card/cardMeaning";
import { userTable } from "./user";

export const userCardMeaningTable = sqliteTable(
  "user_card_meaning",
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
      table.cardMeaningId,
    ),
    index("user_card_meanings_card_meaning_index").on(table.cardMeaningId),
  ],
);
