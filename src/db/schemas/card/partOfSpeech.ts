import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const partOfSpeechTable = sqliteTable("part_of_speech", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  value: text("value").notNull(),
});
