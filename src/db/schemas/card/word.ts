import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const wordTable = sqliteTable("word", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  title: text("title").notNull(),

  transcription: text("transcription"),

  audioUrl: text("audio_url"),

  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),

  updatedAt: text("updated_at").$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
});
