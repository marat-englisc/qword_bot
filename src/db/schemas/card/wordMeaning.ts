import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { wordTable } from "./word";
import { partOfSpeechTable } from "./partOfSpeech";
import { cefrLevelTable } from "./cefrLevel";

export const wordMeaningTable = sqliteTable(
  "word_meaning",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    wordId: integer("word_id")
      .notNull()
      .references(() => wordTable.id, {
        onDelete: "cascade",
      }),

    partOfSpeechId: integer("part_of_speech_id")
      .notNull()
      .references(() => partOfSpeechTable.id, {
        onDelete: "cascade",
      }),

    cefrLevelId: integer("cefr_level_id")
      .notNull()
      .references(() => cefrLevelTable.id, {
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
  (table) => [index("word_meaning_word_id_index").on(table.wordId)],
);
