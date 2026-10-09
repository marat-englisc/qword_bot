import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cardTable } from "./card";

export const cardMeaningTable = sqliteTable(
  "card_meaning",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    cardId: integer("card_id")
      .notNull()
      .references(() => cardTable.id, {
        onDelete: "cascade",
      }),

    hint: text("hint"),

    meaning: text("meaning").notNull(),

    meaningTranslation: text("meaning_translation").notNull(),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [index("card_meanings_card_id_index").on(table.cardId)],
);
