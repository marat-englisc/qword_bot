import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const cefrLevelTable = sqliteTable("cefr_level", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  value: text("value").notNull(),
});
