import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const deckTable = sqliteTable("deck", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  name: text("name").notNull(),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),

  updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});
