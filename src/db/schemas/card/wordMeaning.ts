import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { wordTable } from "./word";
import { partOfSpeechTable } from "./partOfSpeech";
import { cefrLevelTable } from "./cefrLevel";
import { finiteNumber, nonBlankText } from "../../schemaChecks";

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
        onDelete: "restrict",
      }),

    cefrLevelId: integer("cefr_level_id")
      .notNull()
      .references(() => cefrLevelTable.id, {
        onDelete: "restrict",
      }),

    hint: text("hint"),

    meaning: text("meaning").notNull(),

    meaningTranslation: text("meaning_translation").notNull(),

    // Optional calibrated vocabulary difficulty in logits, NOT FSRS difficulty.
    // Until calibrated, derive it from cefrLevelTable.value (see docs).
    vocabularyDifficulty: real("vocabulary_difficulty"),

    isRecommendable: integer("is_recommendable", { mode: "boolean" })
      .notNull()
      .default(true),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    index("word_meaning_word_id_index").on(table.wordId),
    index("word_meaning_cefr_recommendable_index").on(
      table.cefrLevelId,
      table.isRecommendable,
    ),
    index("word_meaning_part_of_speech_index").on(table.partOfSpeechId),
    check(
      "word_meaning_recommendable_check",
      sql`${table.isRecommendable} IN (0, 1)`,
    ),
    check("word_meaning_meaning_check", nonBlankText(table.meaning)),
    check(
      "word_meaning_translation_check",
      nonBlankText(table.meaningTranslation),
    ),
    check(
      "word_meaning_difficulty_check",
      sql`${table.vocabularyDifficulty} IS NULL OR ${finiteNumber(table.vocabularyDifficulty)}`,
    ),
  ],
);
