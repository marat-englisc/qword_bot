import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { deckTable } from "./deck";

export const cardTable = sqliteTable(
  "card",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    deckId: integer("deck_id")
      .notNull()
      .references(() => deckTable.id, {
        onDelete: "restrict",
      }),

    title: text("title").notNull(),

    transcription: text("transcription"),

    audioUrl: text("audio_url"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [index("cards_deck_id_index").on(table.deckId)],
);
