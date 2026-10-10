import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { wordMeaningTable } from "./wordMeaning";
import { nonBlankText } from "../../schemaChecks";

export const wordMeaningExampleTable = sqliteTable(
  "word_meaning_example",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    wordMeaningId: integer("word_meaning_id")
      .notNull()
      .references(() => wordMeaningTable.id, {
        onDelete: "cascade",
      }),

    example: text("example").notNull(),

    exampleTranslation: text("example_translation").notNull(),
  },
  (table) => [
    index("word_meaning_examples_word_meaning_id_index").on(
      table.wordMeaningId,
    ),
    check("word_meaning_example_text_check", nonBlankText(table.example)),
    check(
      "word_meaning_example_translation_check",
      nonBlankText(table.exampleTranslation),
    ),
  ],
);
