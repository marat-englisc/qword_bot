import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cardMeaningTable } from "./cardMeaning";

export const cardExampleTable = sqliteTable(
  "card_example",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    cardMeaningId: integer("card_meaning_id")
      .notNull()
      .references(() => cardMeaningTable.id, {
        onDelete: "cascade",
      }),

    example: text("example").notNull(),

    exampleTranslation: text("example_translation").notNull(),
  },
  (table) => [
    index("card_examples_card_meaning_id_index").on(table.cardMeaningId),
  ],
);
