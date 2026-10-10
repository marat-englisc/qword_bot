import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { nonBlankText, nonNegativeInteger } from "../../schemaChecks";

export const wordTable = sqliteTable(
  "word",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    title: text("title").notNull(),

    transcription: text("transcription"),

    audioUrl: text("audio_url"),

    // Lemma frequency in a named corpus; 1 is the most frequent word.
    frequencyRank: integer("frequency_rank"),

    frequencySource: text("frequency_source"),

    createdAt: text("created_at")
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),

    updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    // Not unique: homographs can have different pronunciations.
    index("word_title_index").on(table.title),
    check("word_title_check", nonBlankText(table.title)),
    check(
      "word_frequency_rank_check",
      sql`${table.frequencyRank} IS NULL OR (${nonNegativeInteger(table.frequencyRank)} AND ${table.frequencyRank} >= 1)`,
    ),
    check(
      "word_frequency_source_check",
      sql`${table.frequencyRank} IS NULL OR (${table.frequencySource} IS NOT NULL AND ${nonBlankText(table.frequencySource)})`,
    ),
  ],
);
