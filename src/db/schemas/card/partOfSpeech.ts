import { sql } from "drizzle-orm";
import {
  check,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { nonBlankText } from "../../schemaChecks";

export const partOfSpeechTable = sqliteTable(
  "part_of_speech",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    value: text("value").notNull(),
  },
  (table) => [
    uniqueIndex("part_of_speech_value_unique").on(
      sql`lower(trim(${table.value}))`,
    ),
    check("part_of_speech_value_check", nonBlankText(table.value)),
  ],
);
