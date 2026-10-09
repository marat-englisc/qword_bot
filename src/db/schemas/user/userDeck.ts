import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { deckTable } from "../card/deck";
import { userTable } from "./user";

export const userDeckTable = sqliteTable(
  "user_deck",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    userId: integer("user_id")
      .notNull()
      .references(() => userTable.id, {
        onDelete: "cascade",
      }),

    deckId: integer("deck_id")
      .notNull()
      .references(() => deckTable.id, {
        onDelete: "cascade",
      }),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    lastReviewedAt: integer("last_reviewed_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("user_decks_deck_unique").on(table.userId, table.deckId),
    index("user_decks_deck_id_index").on(table.deckId),
  ],
);
